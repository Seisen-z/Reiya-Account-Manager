
//! Server-authorized Premium. No client-side flag grants cloud access.
use super::*;
use aes_gcm::aead::Payload;
use serde_json::{json,Value};
use std::collections::BTreeMap;
const MAX_SNAPSHOT:usize=2_000_000;
const API_ORIGIN:&str=match option_env!("REIYA_PREMIUM_API_URL"){Some(v)=>v,None=>if cfg!(debug_assertions){"http://localhost:5173"}else{"https://www.reiyaa.co"}};
static OPERATION:Mutex<()>=Mutex::new(());
#[derive(Serialize,Deserialize)] struct Credentials {key:String,device_id:String}
#[derive(Deserialize,Clone)] struct Authorization {token:String,cloud_key:String,profile_id:String,display_name:String,expires_at:String}
#[derive(Serialize,Deserialize)] struct Snapshot {version:u32,profile_id:String,files:BTreeMap<String,Value>,preferences:BTreeMap<String,String>}
#[cfg(windows)]
#[repr(C)] struct Blob{len:u32,data:*mut u8}
#[cfg(windows)]
#[link(name="crypt32")]
extern "system" {fn CryptProtectData(input:*const Blob,description:*const u16,entropy:*const Blob,reserved:*mut std::ffi::c_void,prompt:*mut std::ffi::c_void,flags:u32,output:*mut Blob)->i32;}
fn protect(bytes:&[u8])->Result<Vec<u8>,String>{
 #[cfg(windows)]{let input=Blob{len:bytes.len() as u32,data:bytes.as_ptr() as *mut u8};let mut output=Blob{len:0,data:std::ptr::null_mut()};unsafe{if CryptProtectData(&input,std::ptr::null(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),1,&mut output)==0{return Err("Windows credential protection failed".into());}let result=std::slice::from_raw_parts(output.data,output.len as usize).to_vec();windows_sys::Win32::Foundation::LocalFree(output.data as _);Ok(result)}}
 #[cfg(not(windows))]{let _=bytes;Err("Windows credential protection required".into())}
}
fn credentials_path()->PathBuf{data_dir().join("premium-credentials.dpapi")}
fn load_credentials()->Result<Credentials,String>{let b=fs::read(credentials_path()).map_err(|_|"Activate a Premium key first")?;let plain=browser_extractor::dpapi_decrypt_bytes(&b)?;serde_json::from_slice(&plain).map_err(|_|"Invalid protected Premium credentials".into())}
fn random_hex()->String{let mut b=[0u8;32];OsRng.fill_bytes(&mut b);b.iter().map(|v|format!("{:02x}",v)).collect()}
fn endpoint_policy(origin:&url::Url,development:bool)->Result<bool,String>{
 if !origin.username().is_empty()||origin.password().is_some()||origin.path()!="/"||origin.query().is_some()||origin.fragment().is_some(){return Err("Invalid Premium API origin".into());}
 let local=development&&origin.scheme()=="http"&&origin.port()==Some(5173)&&matches!(origin.host_str(),Some("localhost"|"127.0.0.1"|"::1"));
 if origin.scheme()!="https"&&!local{return Err("HTTPS Premium service required; local HTTP is development-only".into());}
 Ok(local)
}
async fn api(action:&str,method:reqwest::Method,body:Option<Value>,token:Option<&str>)->Result<Value,String>{
 let origin=url::Url::parse(API_ORIGIN).map_err(|_|"Invalid Premium service URL")?;
 let local=endpoint_policy(&origin,cfg!(debug_assertions))?;
 let client=reqwest::Client::builder().https_only(!local).redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(30)).build().map_err(|_|"Network initialization failed")?;
 let mut request=client.request(method,format!("{}/api/premium?{}",origin.as_str().trim_end_matches('/'),action));
 if let Some(t)=token{request=request.bearer_auth(t);}if let Some(b)=body{request=request.json(&b);}
 let response=request.send().await.map_err(|_|"Premium service connection failed; local data remains available")?;let status=response.status();
 let is_json=response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v|v.to_str().ok()).map_or(false,|v|v.contains("application/json"));
 if !is_json{return Err(format!("Premium API did not return JSON (HTTP {}). For local tests, keep the website dev server running on port 5173.",status.as_u16()));}
 let bytes=response.bytes().await.map_err(|_|"Premium response failed")?;if bytes.len()>3_300_000{return Err("Premium response too large".into());}
 let value:Value=serde_json::from_slice(&bytes).map_err(|_|"Invalid Premium server response")?;
 if !status.is_success(){return Err(value["error"].as_str().unwrap_or("Premium authorization failed").to_string());}Ok(value)
}

fn refund_marker()->PathBuf{data_dir().join("premium-refund-erasure.pending")}
fn reparse(meta:&fs::Metadata)->bool{
 #[cfg(windows)]{use std::os::windows::fs::MetadataExt;meta.file_attributes()&0x400!=0}
 #[cfg(not(windows))]{meta.file_type().is_symlink()}
}
fn verified_erasure_root(root:&PathBuf)->Result<(),String>{
 if !root.is_absolute()||root.file_name().and_then(|n|n.to_str())!=Some("Seistem"){return Err("Refund erasure root is invalid".into());}
 let parent=root.parent().ok_or("Refund erasure root has no parent")?;
 if !parent.is_dir(){return Err("Refund erasure parent does not exist".into());}
 if root.exists(){let m=fs::symlink_metadata(root).map_err(|_|"Refund erasure root inspection failed")?;if reparse(&m)||!m.is_dir(){return Err("Refund erasure root cannot be a linked directory".into());}}
 Ok(())
}
fn remove_managed_entry(path:&PathBuf,root:&PathBuf)->Result<(),String>{
 if path==root||!path.starts_with(root){return Err("Refund erasure escaped the managed root".into());}
 let m=fs::symlink_metadata(path).map_err(|_|"Refund erasure entry inspection failed")?;
 if reparse(&m){
  #[cfg(windows)]{use std::os::windows::fs::MetadataExt;let result=if m.file_attributes()&0x10!=0{fs::remove_dir(path)}else{fs::remove_file(path)};return result.map_err(|_|"Refund erasure could not remove a directory link".into());}
  #[cfg(not(windows))]{return fs::remove_file(path).map_err(|_|"Refund erasure could not remove a link".into());}
 }
 if m.is_dir(){for e in fs::read_dir(path).map_err(|_|"Refund erasure directory read failed")?{remove_managed_entry(&e.map_err(|_|"Refund erasure entry read failed")?.path(),root)?;}fs::remove_dir(path).map_err(|_|"Close apps using Reiya files, then retry refund cleanup".into())}
 else{#[cfg(windows)] if m.permissions().readonly(){let mut perms=m.permissions();perms.set_readonly(false);fs::set_permissions(path,perms).map_err(|_|"Refund erasure could not unlock a file")?;}fs::remove_file(path).map_err(|_|"Close apps using Reiya files, then retry refund cleanup".into())}
}
fn erase_managed_roots(app:&PathBuf,boot:&PathBuf)->Result<(),String>{
 verified_erasure_root(app)?;verified_erasure_root(boot)?;
 if app==boot||app.starts_with(boot)||boot.starts_with(app){return Err("Refund erasure roots overlap".into());}
 // Preserve the retry journal and protected key until every other managed entry is removed.
 for root in [app,boot]{if !root.exists(){continue;}for e in fs::read_dir(root).map_err(|_|"Refund erasure directory read failed")?{let path=e.map_err(|_|"Refund erasure entry read failed")?.path();if root==app&&matches!(path.file_name().and_then(|n|n.to_str()),Some("premium-refund-erasure.pending"|"premium-credentials.dpapi")){continue;}remove_managed_entry(&path,root)?;}}
 let key=app.join("premium-credentials.dpapi");if key.exists(){fs::remove_file(key).map_err(|_|"Refund erasure could not remove Premium credentials")?;}
 Ok(())
}
#[tauri::command]pub async fn premium_refund_check()->Result<Value,String>{
 let marker=refund_marker();
 if marker.exists()&&fs::read_to_string(&marker).unwrap_or_default()=="completed"{return Ok(json!({"erased":true}));}
 if !marker.exists(){
  if !credentials_path().exists(){return Ok(json!({"erased":false}));}
  let c=load_credentials()?;
  let result=match api("action=refund-status",reqwest::Method::POST,Some(json!({"key":c.key})),None).await{Ok(v)=>v,Err(_)=>return Ok(json!({"erased":false,"check_unavailable":true}))};
  if result["refunded"]!=true||result["erase_local_data"]!=true{return Ok(json!({"erased":false}));}
  atomic_write(&marker,b"pending".to_vec()).map_err(|_|"Could not save refund erasure journal")?;
 }
 let _guard=OPERATION.lock().map_err(|_|"Refund operation lock failed")?;
 // No relative fallback roots: a missing OS directory never authorizes deletion.
 let roaming=std::env::var("APPDATA").map_err(|_|"Refund erasure requires APPDATA")?;
 let local=std::env::var("LOCALAPPDATA").map_err(|_|"Refund erasure requires LOCALAPPDATA")?;
 erase_managed_roots(&PathBuf::from(roaming).join("Seistem"),&PathBuf::from(local).join("Seistem"))?;
 *VAULT_KEY.lock().map_err(|_|"Vault state lock failed")?=None;
 atomic_write(&marker,b"completed".to_vec()).map_err(|_|"Could not finalize refund erasure journal")?;
 Ok(json!({"erased":true}))
}
#[tauri::command]pub fn premium_refund_ack()->Result<(),String>{let p=refund_marker();if !p.exists(){return Ok(());}if fs::read_to_string(&p).unwrap_or_default()!="completed"{return Err("Refund cleanup is still pending".into());}fs::remove_file(p).map_err(|_|"Refund cleanup acknowledgement failed".into())}
async fn authenticate(c:&Credentials,name:&str)->Result<Authorization,String>{if refund_marker().exists(){return Err("Refund data deletion is pending".into());}let v=api("action=activate",reqwest::Method::POST,Some(json!({"key":c.key,"device_id":c.device_id,"display_name":name})),None).await?;serde_json::from_value(v).map_err(|_|"Invalid Premium authorization response".into())}
fn public_status(a:&Authorization)->Value{json!({"premium":true,"profile_id":a.profile_id,"display_name":a.display_name,"expires_at":a.expires_at})}
#[tauri::command]pub async fn premium_activate(key:String,display_name:String)->Result<Value,String>{
 let key=key.trim().to_ascii_uppercase();if !key.starts_with("REIYA-P-")||key.len()!=72||!key[8..].bytes().all(|b|b.is_ascii_hexdigit()){return Err("Invalid Premium key format".into());}
 let old=load_credentials().ok();let c=Credentials{key,device_id:old.map(|c|c.device_id).unwrap_or_else(random_hex)};let a=authenticate(&c,&display_name).await?;
 let bytes=serde_json::to_vec(&c).map_err(|_|"Credential serialization failed")?;atomic_write(&credentials_path(),protect(&bytes)?).map_err(|_|"Credential save failed")?;Ok(public_status(&a))
}
#[tauri::command]pub async fn premium_status()->Result<Value,String>{if !credentials_path().exists(){return Ok(json!({"premium":false,"state":"free"}));}let c=load_credentials()?;let state=api("action=key-status",reqwest::Method::POST,Some(json!({"key":c.key})),None).await?;Ok(state)}
fn allowed_file(name:&str)->bool{if let Some(n)=name.strip_prefix("app/"){let stem=n.split('.').next().unwrap_or("").to_ascii_lowercase();if matches!(stem.as_str(),"con"|"prn"|"aux"|"nul")||stem.starts_with("com")||stem.starts_with("lpt"){return false;}return n.bytes().all(|b|b.is_ascii_alphanumeric()||matches!(b,b'_'|b'-'|b'.'))&&n.ends_with(".json")&&!n.contains('/')&&!n.contains('\\')&&!n.starts_with('.')&&!matches!(n,"security.json"|"session_tracker.json")&&!n.starts_with("premium")&&n.len()<100;}matches!(name,"bootstrapper/fastflags.json"|"bootstrapper/version-labels.json")}
fn file_path(name:&str)->Result<PathBuf,String>{if !allowed_file(name){return Err("Invalid backup file path".into());}if let Some(n)=name.strip_prefix("app/"){Ok(data_dir().join(n))}else{Ok(bootstrapper_root().join(name.trim_start_matches("bootstrapper/")))}}
fn portable_accounts()->Result<Value,String>{let path=accounts_path();let raw=fs::read_to_string(path).map_err(|_|"Account data read failed")?;let mut accounts:Vec<StoredAccount>=serde_json::from_str(clean_bom(&raw)).map_err(|_|"Account data is invalid")?;for a in &mut accounts{a.encrypted_cookie=decrypt_cookie(&a.encrypted_cookie)?;if let Some(p)=&a.password{a.password=Some(decrypt_password(p));}}serde_json::to_value(accounts).map_err(|_|"Account serialization failed".into())}
fn collect(profile:&str,preferences:BTreeMap<String,String>)->Result<Snapshot,String>{
 if !is_vault_unlocked(){return Err("Unlock your local vault before backing up".into());}
 let mut files=BTreeMap::new();for entry in fs::read_dir(data_dir()).map_err(|_|"Data directory read failed")?{let e=entry.map_err(|_|"Data file read failed")?;let name=format!("app/{}",e.file_name().to_string_lossy());if !allowed_file(&name)||!e.file_type().map_err(|_|"Data file type failed")?.is_file(){continue;}
 if e.metadata().map_err(|_|"Data file metadata failed")?.len()>MAX_SNAPSHOT as u64{return Err("App data exceeds cloud backup size limit".into());}
 let v=if name=="app/accounts.json"{portable_accounts()?}else{let raw=fs::read_to_string(e.path()).map_err(|_|"App data read failed")?;serde_json::from_str(clean_bom(&raw)).map_err(|_|format!("Invalid JSON in {}",name))?};files.insert(name,v);}
 for name in ["bootstrapper/fastflags.json","bootstrapper/version-labels.json"]{let p=file_path(name)?;if p.exists(){let raw=fs::read_to_string(p).map_err(|_|"Bootstrapper settings read failed")?;files.insert(name.into(),serde_json::from_str(clean_bom(&raw)).map_err(|_|"Invalid bootstrapper settings")?);}}
 if files.len()>100{return Err("Too many app data files for one snapshot".into());}let preferences=preferences.into_iter().filter(|(k,_)|valid_preference(k)).collect();Ok(Snapshot{version:1,profile_id:profile.into(),files,preferences})
}
fn valid_preference(key:&str)->bool{key.starts_with("reiya_")&&key.len()<100&&!key.contains("premium")&&!key.contains("token")&&!key.contains("password")&&!key.contains("cookie")&&!key.contains("license")}
fn encrypt_snapshot(bytes:&[u8],key:&[u8],profile:&str)->Result<String,String>{if bytes.len()>MAX_SNAPSHOT{return Err("Cloud snapshot exceeds 2 MB limit".into());}let cipher=Aes256Gcm::new_from_slice(key).map_err(|_|"Invalid cloud encryption key")?;let mut nonce=[0u8;12];OsRng.fill_bytes(&mut nonce);let encrypted=cipher.encrypt(Nonce::from_slice(&nonce),Payload{msg:bytes,aad:format!("reiya-backup-v1:{}",profile).as_bytes()}).map_err(|_|"Cloud encryption failed")?;let mut out=nonce.to_vec();out.extend(encrypted);Ok(B64.encode(out))}
fn decrypt_snapshot(encoded:&str,key:&[u8],profile:&str)->Result<Snapshot,String>{let data=B64.decode(encoded).map_err(|_|"Invalid backup encoding")?;if data.len()<28||data.len()>MAX_SNAPSHOT+28{return Err("Invalid backup size".into());}let cipher=Aes256Gcm::new_from_slice(key).map_err(|_|"Invalid cloud key")?;let plain=cipher.decrypt(Nonce::from_slice(&data[..12]),Payload{msg:&data[12..],aad:format!("reiya-backup-v1:{}",profile).as_bytes()}).map_err(|_|"Backup authentication failed")?;let s:Snapshot=serde_json::from_slice(&plain).map_err(|_|"Invalid backup snapshot")?;if s.version!=1||s.profile_id!=profile||s.files.len()>100{return Err("Unsupported backup snapshot".into());}for name in s.files.keys(){file_path(name)?;}if s.preferences.keys().any(|k|!valid_preference(k)){return Err("Invalid backup preference".into());}Ok(s)}
#[tauri::command]pub async fn premium_backup(preferences:BTreeMap<String,String>)->Result<Value,String>{let c=load_credentials()?;let a=authenticate(&c,"").await?;let s=collect(&a.profile_id,preferences)?;let bytes=serde_json::to_vec(&s).map_err(|_|"Snapshot serialization failed")?;let key=B64.decode(&a.cloud_key).map_err(|_|"Invalid cloud key")?;let cipher=encrypt_snapshot(&bytes,&key,&a.profile_id)?;let count=s.files.get("app/accounts.json").and_then(Value::as_array).map_or(0,Vec::len);api("action=backup",reqwest::Method::POST,Some(json!({"ciphertext":cipher,"metadata":{"version":1,"accounts":count,"files":s.files.len(),"bytes":bytes.len()}})),Some(&a.token)).await}
#[tauri::command]pub async fn premium_backups()->Result<Value,String>{let c=load_credentials()?;let a=authenticate(&c,"").await?;api("action=backup",reqwest::Method::GET,None,Some(&a.token)).await}
#[tauri::command]pub async fn premium_restore(backup_id:String)->Result<Value,String>{if !is_vault_unlocked(){return Err("Unlock your local vault before restoring".into());}if backup_id.len()!=36||!backup_id.bytes().all(|b|b.is_ascii_hexdigit()||b==b'-'){return Err("Invalid backup ID".into());}let c=load_credentials()?;let a=authenticate(&c,"").await?;let v=api(&format!("action=backup&id={}",backup_id),reqwest::Method::GET,None,Some(&a.token)).await?;let key=B64.decode(&a.cloud_key).map_err(|_|"Invalid cloud key")?;let mut s=decrypt_snapshot(v["ciphertext"].as_str().ok_or("Missing backup data")?,&key,&a.profile_id)?;
 if let Some(v)=s.files.get_mut("app/accounts.json"){let mut accounts:Vec<StoredAccount>=serde_json::from_value(v.clone()).map_err(|_|"Invalid backup accounts")?;for acc in &mut accounts{acc.encrypted_cookie=encrypt_cookie(&acc.encrypted_cookie);if let Some(p)=&acc.password{acc.password=Some(encrypt_cookie(p));}}*v=serde_json::to_value(accounts).map_err(|_|"Account conversion failed")?;}
 let protected=protect(&serde_json::to_vec(&s).map_err(|_|"Restore staging failed")?)?;atomic_write(&data_dir().join("premium-restore-pending.dpapi"),protected).map_err(|_|"Restore staging failed")?;Ok(json!({"staged":true,"preferences":s.preferences,"restart_required":true}))
}
// Applied before loading account state, not while background tasks can overwrite restored files.
#[cfg(test)] static RESTORE_FAIL_AFTER:std::sync::atomic::AtomicIsize=std::sync::atomic::AtomicIsize::new(-1);
fn restore_preferences_path()->PathBuf{data_dir().join("premium-restore-preferences.json")}
#[tauri::command]pub fn premium_restore_preferences(acknowledge:bool)->Result<Option<BTreeMap<String,String>>,String>{
 let path=restore_preferences_path();if !path.exists(){return Ok(None);}
 if acknowledge{fs::remove_file(path).map_err(|_|"Restore preference acknowledgement failed")?;return Ok(None);}
 let preferences:BTreeMap<String,String>=serde_json::from_slice(&fs::read(path).map_err(|_|"Restored preferences read failed")?).map_err(|_|"Invalid restored preferences")?;
 if preferences.keys().any(|k|!valid_preference(k)){return Err("Invalid restored preference".into());}Ok(Some(preferences))
}
pub fn apply_pending_restore()->Result<(),String>{
 let pending=data_dir().join("premium-restore-pending.dpapi");if !pending.exists(){return Ok(());}
 let _guard=OPERATION.lock().map_err(|_|"Restore lock failed")?;
 let plain=browser_extractor::dpapi_decrypt_bytes(&fs::read(&pending).map_err(|_|"Restore staging read failed")?)?;
 let s:Snapshot=serde_json::from_slice(&plain).map_err(|_|"Invalid staged restore")?;
 if s.version!=1||s.files.len()>100||s.preferences.keys().any(|k|!valid_preference(k)){return Err("Unsupported staged restore".into());}
 let mut operations:BTreeMap<String,(PathBuf,Option<Vec<u8>>)>=BTreeMap::new();
 for(name,value)in &s.files{operations.insert(name.clone(),(file_path(name)?,Some(serde_json::to_vec_pretty(value).map_err(|_|"Restore serialization failed")?)));}
 // A full snapshot replaces managed data, rather than merging stale files into it.
 for entry in fs::read_dir(data_dir()).map_err(|_|"Restore directory read failed")?{
  let e=entry.map_err(|_|"Restore directory read failed")?;let name=format!("app/{}",e.file_name().to_string_lossy());
  if allowed_file(&name)&&e.file_type().map_err(|_|"Restore file type failed")?.is_file()&&!s.files.contains_key(&name){operations.insert(name,(e.path(),None));}
 }
 for name in ["bootstrapper/fastflags.json","bootstrapper/version-labels.json"]{let path=file_path(name)?;if path.exists()&&!s.files.contains_key(name){operations.insert(name.into(),(path,None));}}
 operations.insert("preferences/committed.json".into(),(restore_preferences_path(),Some(serde_json::to_vec(&s.preferences).map_err(|_|"Restore preference serialization failed")?)));
 let mut prepared=Vec::new();
 for(name,(target,bytes))in operations{let old=if target.exists(){Some(fs::read(&target).map_err(|_|"Pre-restore backup read failed")?)}else{None};prepared.push((name,target,bytes,old));}
 let rollback=data_dir().join(format!("cloud-restore-rollback-{}",Utc::now().timestamp_millis()));fs::create_dir_all(&rollback).map_err(|_|"Rollback directory failed")?;
 for(name,_,_,old)in &prepared{if let Some(bytes)=old{let path=rollback.join(name);fs::create_dir_all(path.parent().ok_or("Invalid rollback path")?).map_err(|_|"Rollback directory failed")?;atomic_write(&path,bytes).map_err(|_|"Pre-restore backup failed")?;}}
 for(index,(_,target,bytes,_))in prepared.iter().enumerate(){
  #[cfg(test)] let injected=RESTORE_FAIL_AFTER.load(std::sync::atomic::Ordering::SeqCst)==index as isize;
  #[cfg(not(test))] let injected={let _=index;false};
  let result=if injected{Err(std::io::Error::new(std::io::ErrorKind::Other,"Synthetic restore failure"))}else if let Some(bytes)=bytes{atomic_write(target,bytes)}else if target.exists(){fs::remove_file(target)}else{Ok(())};
  if result.is_err(){let mut failed=false;for(_,path,_,old)in &prepared{let result=if let Some(bytes)=old{atomic_write(path,bytes)}else if path.exists(){fs::remove_file(path)}else{Ok(())};if result.is_err(){failed=true;}}
   return Err(if failed{"Restore and recovery incomplete; retained rollback directory for recovery"}else{"Restore failed; original data restored"}.into());
  }
 }
 fs::remove_file(pending).map_err(|_|"Restore committed; staging cleanup failed")?;Ok(())
}
#[tauri::command]pub fn premium_restart(app:AppHandle){app.restart();}
#[tauri::command]pub async fn premium_deactivate()->Result<(),String>{let c=load_credentials()?;let a=authenticate(&c,"").await?;api("action=deactivate",reqwest::Method::POST,Some(json!({})),Some(&a.token)).await?;fs::remove_file(credentials_path()).map_err(|_|"Local credential removal failed".to_string())?;Ok(())}
#[cfg(test)]mod tests{use super::*;
 #[tokio::test]#[ignore]async fn premium_paid_refund_fixture(){
  let root=PathBuf::from(std::env::var("REIYA_PAID_REFUND_ROOT").unwrap());assert!(root.is_absolute()&&root.to_string_lossy().contains("premium-completion-20261010"));std::env::set_var("APPDATA",root.join("roam"));std::env::set_var("LOCALAPPDATA",root.join("local"));fs::create_dir_all(root.join("roam")).unwrap();fs::create_dir_all(root.join("local")).unwrap();let app=data_dir();let boot=bootstrapper_root();assert!(app.starts_with(&root)&&boot.starts_with(&root));
  if std::env::var("REIYA_PAID_REFUND_PHASE").unwrap()=="prepare"{
   premium_activate(std::env::var("REIYA_PAID_REFUND_KEY").unwrap(),"Isolated Sandbox refund test".into()).await.unwrap();*VAULT_KEY.lock().unwrap()=Some([37u8;32]);
   let cookie="synthetic refund-test cookie, not a real Roblox credential";
   let account:StoredAccount=serde_json::from_value(json!({"user_id":700000001,"username":std::env::var("REIYA_PAID_REFUND_USERNAME").unwrap(),"display_name":"Synthetic refund account","encrypted_cookie":encrypt_with_key(cookie,&[37u8;32]),"password":encrypt_with_key("synthetic refund-test password",&[37u8;32])})).unwrap();
   fs::write(accounts_path(),serde_json::to_vec(&vec![account]).unwrap()).unwrap();fs::write(app.join("settings.json"),b"{\"free_mode_test\":true}").unwrap();fs::write(boot.join("fastflags.json"),b"{}").unwrap();assert_eq!(premium_refund_check().await.unwrap()["erased"],false);
   fs::write(root.join("fixture-device.json"),serde_json::to_vec(&json!({"device_id":load_credentials().unwrap().device_id})).unwrap()).unwrap();
   let backup=premium_backup(BTreeMap::from([("reiya_paid_refund_test".into(),"fixture".into())])).await.unwrap();assert!(backup["id"].is_string());
   sync_owned_metadata(std::env::var("REIYA_PAID_REFUND_USERNAME").unwrap(),"Synthetic refund account".into(),cookie.into(),1).await.unwrap();
   println!("PASS paid Sandbox key: native activation, synthetic credential encryption, actual cloud upload and ownership-scoped metadata sync");
  }else{
   assert_eq!(premium_refund_check().await.unwrap()["erased"],true);assert!(!accounts_path().exists());assert!(!app.join("settings.json").exists());assert!(!boot.join("fastflags.json").exists());assert!(!credentials_path().exists());assert_eq!(fs::read_to_string(refund_marker()).unwrap(),"completed");premium_refund_ack().unwrap();
   println!("PASS paid Sandbox refund: connected native command erased isolated accounts/settings/bootstrapper/activation and acknowledged journal");
  }
 }

 #[tokio::test]#[ignore]async fn premium_refund_connected_fixture(){
  let root=PathBuf::from(std::env::var("REIYA_REFUND_FIXTURE_ROOT").unwrap());assert!(root.is_absolute()&&root.to_string_lossy().contains("refund-erasure-20261010"));
  std::env::set_var("APPDATA",root.join("roam"));std::env::set_var("LOCALAPPDATA",root.join("local"));fs::create_dir_all(root.join("roam")).unwrap();fs::create_dir_all(root.join("local")).unwrap();
  let app=data_dir();let boot=bootstrapper_root();assert!(app.starts_with(&root)&&boot.starts_with(&root));let expected=std::env::var("REIYA_EXPECT_REFUND").unwrap()=="1";
  if !expected{let c=Credentials{key:std::env::var("REIYA_TEST_REFUND_KEY").unwrap(),device_id:random_hex()};atomic_write(&credentials_path(),protect(&serde_json::to_vec(&c).unwrap()).unwrap()).unwrap();fs::write(app.join("accounts.json"),b"synthetic fixture account").unwrap();fs::write(boot.join("fastflags.json"),b"{}").unwrap();}
  let value=premium_refund_check().await.unwrap();assert_eq!(value["erased"],expected);
  if expected{assert!(!app.join("accounts.json").exists());assert!(!credentials_path().exists());assert!(!boot.join("fastflags.json").exists());assert_eq!(fs::read_to_string(refund_marker()).unwrap(),"completed");premium_refund_ack().unwrap();assert!(!refund_marker().exists());println!("PASS connected native command: confirmed refund erased isolated local data, removed credentials, and acknowledged retry journal");}
  else{assert_eq!(fs::read(app.join("accounts.json")).unwrap(),b"synthetic fixture account");assert!(credentials_path().exists());assert!(boot.join("fastflags.json").exists());println!("PASS connected native command: expired subscription preserved isolated local data");}
 }

 #[test]fn premium_refund_erasure_fixture(){
  let fixture=std::env::temp_dir().join(format!("reiya-refund-erasure-{}",random_hex()));let app=fixture.join("app").join("Seistem");let boot=fixture.join("boot").join("Seistem");let outside=fixture.join("outside");
  for p in [&app,&boot,&outside]{fs::create_dir_all(p).unwrap();}
  fs::write(app.join("accounts.json"),b"synthetic account").unwrap();fs::write(app.join("settings.json"),b"free-mode settings").unwrap();fs::write(app.join("premium-credentials.dpapi"),b"fixture credentials").unwrap();fs::write(app.join("premium-refund-erasure.pending"),b"pending").unwrap();
  fs::create_dir_all(app.join("login_profiles/test")).unwrap();fs::write(app.join("login_profiles/test/cookie"),b"fixture profile").unwrap();fs::write(boot.join("fastflags.json"),b"{}").unwrap();fs::write(outside.join("keep.txt"),b"unrelated data").unwrap();
  #[cfg(windows)]{let link=app.join("linked-outside");let result=std::process::Command::new("cmd").args(["/D","/C","mklink","/J"]).arg(&link).arg(&outside).output().unwrap();assert!(result.status.success(),"junction fixture creation failed: {} {}",String::from_utf8_lossy(&result.stdout),String::from_utf8_lossy(&result.stderr));}
  erase_managed_roots(&app,&boot).unwrap();assert_eq!(fs::read(outside.join("keep.txt")).unwrap(),b"unrelated data");assert_eq!(fs::read_dir(&app).unwrap().count(),1);assert!(app.join("premium-refund-erasure.pending").exists());assert_eq!(fs::read_dir(&boot).unwrap().count(),0);erase_managed_roots(&app,&boot).unwrap();
  assert!(verified_erasure_root(&fixture).is_err());assert!(erase_managed_roots(&app,&app).is_err());assert!(remove_managed_entry(&outside,&app).is_err());
  println!("PASS native refund erasure: all managed fixture files removed; journal retained; retry idempotent; outside data and junction target preserved; invalid roots rejected");
  fs::remove_dir_all(fixture).unwrap();
 }

 #[test]fn premium_endpoint_development_only(){
 let local=url::Url::parse("http://localhost:5173").unwrap();assert_eq!(endpoint_policy(&local,true).unwrap(),true);assert!(endpoint_policy(&local,false).is_err());
 for s in ["http://example.com:5173","http://localhost:9999","http://localhost:5173/path","http://user@localhost:5173"]{assert!(endpoint_policy(&url::Url::parse(s).unwrap(),true).is_err());}
 assert_eq!(endpoint_policy(&url::Url::parse("https://www.reiyaa.co").unwrap(),false).unwrap(),false);
 }
 #[tokio::test]async fn premium_local_api_json_response(){
 assert_eq!(API_ORIGIN,"http://localhost:5173");
 let v=api("action=config",reqwest::Method::GET,None,None).await.unwrap();assert_eq!(v["local_test"],true);assert!(v["plans"].as_array().unwrap().iter().any(|p|p["id"]=="monthly"&&p["currency"]=="EUR"));
 let bad=api("action=activate",reqwest::Method::POST,Some(json!({"key":"invalid","device_id":"invalid"})),None).await.unwrap_err();assert_eq!(bad,"Invalid Premium key format");
 }

 #[test]fn premium_crypto_owner_and_tamper(){let bytes=serde_json::to_vec(&Snapshot{version:1,profile_id:"profile-a".into(),files:BTreeMap::new(),preferences:BTreeMap::new()}).unwrap();let key=[7u8;32];let a=encrypt_snapshot(&bytes,&key,"profile-a").unwrap();let b=encrypt_snapshot(&bytes,&key,"profile-a").unwrap();assert_ne!(a,b);assert!(decrypt_snapshot(&a,&key,"profile-a").is_ok());assert!(decrypt_snapshot(&a,&key,"profile-b").is_err());assert!(decrypt_snapshot(&a,&[8u8;32],"profile-a").is_err());let mut raw=B64.decode(a).unwrap();raw[15]^=1;assert!(decrypt_snapshot(&B64.encode(raw),&key,"profile-a").is_err());}
 #[test]fn premium_paths_and_preferences(){for p in ["app/../accounts.json","app/c:settings.json","app/CON.json","app/security.json","app/session_tracker.json","app/premium.json","bootstrapper/Versions/a.exe"]{assert!(!allowed_file(p));}assert!(allowed_file("app/accounts.json"));assert!(allowed_file("app/settings.json"));assert!(valid_preference("reiya_theme_preference_v1"));assert!(!valid_preference("reiya_premium_key"));assert!(!valid_preference("supabase_auth"));}
 #[test]fn premium_windows_protection(){let secret=b"synthetic-test-key-no-user-data";let a=protect(secret).unwrap();assert_ne!(a,secret);assert_eq!(browser_extractor::dpapi_decrypt_bytes(&a).unwrap(),secret);}

 #[tokio::test]
 #[ignore="Requires isolated app directories and a temporary Supabase fixture license"]
 async fn premium_real_cloud_round_trip(){
  use std::sync::atomic::Ordering;
  let root=PathBuf::from(std::env::var("REIYA_ROUNDTRIP_ROOT").expect("isolated test root"));
  assert!(root.is_absolute());assert!(root.to_string_lossy().contains("restore-verification-20261010"));
  let key=std::env::var("REIYA_ROUNDTRIP_KEY").expect("temporary fixture key");
  let source_app=root.join("source/roaming");let source_local=root.join("source/local");
  std::env::set_var("APPDATA",&source_app);std::env::set_var("LOCALAPPDATA",&source_local);
  assert!(data_dir().starts_with(&root));assert!(bootstrapper_root().starts_with(&root));
  *VAULT_KEY.lock().unwrap()=Some([31u8;32]);
  let account:StoredAccount=serde_json::from_value(json!({"user_id":987654321,"username":"SyntheticFixture","display_name":"Fixture Player","encrypted_cookie":encrypt_cookie("synthetic-cookie-not-a-real-account"),"password":encrypt_cookie("synthetic-password-not-a-real-account"),"notes":"fixture notes","tags":["test","backup"],"group":"Fixture group","is_favorite":true,"default_place_id":"12345","default_private_server":"fixture-private-server","launcher_preference":"roblox","launch_preset_name":"fixture preset","launch_delay_seconds":3})).unwrap();
  atomic_write(&accounts_path(),serde_json::to_vec(&vec![account]).unwrap()).unwrap();
  let managed=["settings.json","saved_games.json","pinned_games.json","recent_games.json","groups.json","notes.json","session_history.json","events.json","custom_fixture.json"];
  for (index,name)in managed.iter().enumerate(){atomic_write(&data_dir().join(name),serde_json::to_vec(&json!({"fixture":name,"order":index,"data":["preserved",true,123]})).unwrap()).unwrap();}
  for name in ["bootstrapper/fastflags.json","bootstrapper/version-labels.json"]{atomic_write(&file_path(name).unwrap(),serde_json::to_vec(&json!({"fixture":name,"value":"keep me"})).unwrap()).unwrap();}
  let preferences=BTreeMap::from([("reiya_theme_preference_v1".into(),"{\"mode\":\"manual\",\"themeId\":\"earth-day\"}".into()),("reiya_accounts_view_mode".into(),"list".into()),("reiya_premium_token".into(),"must not be backed up".into())]);
  let active=premium_activate(key.clone(),"Roundtrip fixture".into()).await.unwrap();let profile=active["profile_id"].as_str().unwrap();
  let expected=collect(profile,preferences.clone()).unwrap();assert_eq!(expected.files.len(),12);assert!(!expected.preferences.contains_key("reiya_premium_token"));
  let source_accounts=fs::read(accounts_path()).unwrap();let uploaded=premium_backup(preferences).await.unwrap();let id=uploaded["id"].as_str().unwrap().to_owned();
  let list=premium_backups().await.unwrap();assert!(list["backups"].as_array().unwrap().iter().any(|row|row["id"]==id));
  let source_auth=authenticate(&load_credentials().unwrap(),"").await.unwrap();let cloud=api(&format!("action=backup&id={}",id),reqwest::Method::GET,None,Some(&source_auth.token)).await.unwrap();
  assert!(!cloud["ciphertext"].as_str().unwrap().contains("SyntheticFixture"));
  println!("PASS real cloud: native collect/encrypt/upload/list/download; 12 included JSON files and filtered preferences");
  let target_app=root.join("target/roaming");let target_local=root.join("target/local");std::env::set_var("APPDATA",&target_app);std::env::set_var("LOCALAPPDATA",&target_local);*VAULT_KEY.lock().unwrap()=Some([72u8;32]);
  let target= data_dir();let prior=json!({"prior":"destination original"});atomic_write(&target.join("settings.json"),serde_json::to_vec(&prior).unwrap()).unwrap();atomic_write(&target.join("stale_only.json"),b"{\"stale\":true}").unwrap();atomic_write(&target.join("security.json"),b"{\"mode\":\"default\",\"fixture\":true}").unwrap();atomic_write(&target.join("session_tracker.json"),b"[]").unwrap();
  premium_activate(key,"Target fixture".into()).await.unwrap();let guarded_credentials=fs::read(credentials_path()).unwrap();let guarded_security=fs::read(target.join("security.json")).unwrap();
  let restored=premium_restore(id.clone()).await.unwrap();assert_eq!(serde_json::from_value::<BTreeMap<String,String>>(restored["preferences"].clone()).unwrap(),expected.preferences);
  assert!(target.join("premium-restore-pending.dpapi").exists());assert!(!restore_preferences_path().exists());assert_eq!(serde_json::from_slice::<Value>(&fs::read(target.join("settings.json")).unwrap()).unwrap(),prior);
  let prior_bytes=fs::read(target.join("settings.json")).unwrap();let stale_bytes=fs::read(target.join("stale_only.json")).unwrap();
  RESTORE_FAIL_AFTER.store(12,Ordering::SeqCst);let error=apply_pending_restore().unwrap_err();RESTORE_FAIL_AFTER.store(-1,Ordering::SeqCst);assert_eq!(error,"Restore failed; original data restored");
  assert_eq!(serde_json::from_slice::<Value>(&fs::read(target.join("settings.json")).unwrap()).unwrap(),prior);assert!(target.join("stale_only.json").exists());assert_eq!(fs::read(target.join("settings.json")).unwrap(),prior_bytes);assert_eq!(fs::read(target.join("stale_only.json")).unwrap(),stale_bytes);assert!(!file_path("bootstrapper/fastflags.json").unwrap().exists());assert!(!accounts_path().exists());assert!(!restore_preferences_path().exists());
  println!("PASS partial-write failure: destination originals restored byte-for-byte; newly created files removed; preferences not committed");
  let child=std::process::Command::new(std::env::current_exe().unwrap()).args(["premium::tests::premium_restart_apply_fixture","--exact","--ignored","--nocapture","--test-threads=1"]).env("REIYA_ROUNDTRIP_RESTART","1").output().unwrap();
  print!("{}",String::from_utf8_lossy(&child.stdout));assert!(child.status.success(),"Restart helper failed: {}",String::from_utf8_lossy(&child.stderr));assert!(!target.join("premium-restore-pending.dpapi").exists());assert!(!target.join("stale_only.json").exists());
  let got=collect(profile,expected.preferences.clone()).unwrap();assert_eq!(got.files,expected.files);assert_eq!(got.preferences,expected.preferences);
  assert_eq!(fs::read(credentials_path()).unwrap(),guarded_credentials);assert_eq!(fs::read(target.join("security.json")).unwrap(),guarded_security);assert_eq!(fs::read(target.join("session_tracker.json")).unwrap(),b"[]");
  assert_eq!(fs::read(source_app.join("Seistem/accounts.json")).unwrap(),source_accounts);
  let restored_accounts:Vec<StoredAccount>=serde_json::from_slice(&fs::read(accounts_path()).unwrap()).unwrap();assert!(decrypt_with_key(&restored_accounts[0].encrypted_cookie,&[31u8;32]).is_err());assert_eq!(decrypt_cookie(&restored_accounts[0].encrypted_cookie).unwrap(),"synthetic-cookie-not-a-real-account");assert_eq!(decrypt_password(restored_accounts[0].password.as_ref().unwrap()),"synthetic-password-not-a-real-account");
  let queued=premium_restore_preferences(false).unwrap().unwrap();assert_eq!(queued,expected.preferences);premium_restore_preferences(true).unwrap();assert!(premium_restore_preferences(false).unwrap().is_none());
  println!("PASS restart restore: every included JSON value and preference equals source; accounts re-encrypted under different target vault key; stale managed data removed; local security/session/activation retained");
  let rollback=fs::read_dir(&target).unwrap().filter_map(Result::ok).filter(|e|e.file_name().to_string_lossy().starts_with("cloud-restore-rollback-")).any(|e|e.path().join("app/settings.json").exists());assert!(rollback);
  let previous=fs::read(accounts_path()).unwrap();let valid=B64.decode(cloud["ciphertext"].as_str().unwrap()).unwrap();let mut tampered=valid;tampered[15]^=1;assert!(decrypt_snapshot(&B64.encode(tampered),&B64.decode(source_auth.cloud_key).unwrap(),profile).is_err());assert_eq!(fs::read(accounts_path()).unwrap(),previous);
  let malformed=Snapshot{version:1,profile_id:profile.into(),files:BTreeMap::from([("app/../escape.json".into(),json!({}))]),preferences:BTreeMap::new()};atomic_write(&target.join("premium-restore-pending.dpapi"),protect(&serde_json::to_vec(&malformed).unwrap()).unwrap()).unwrap();assert!(apply_pending_restore().is_err());assert_eq!(fs::read(accounts_path()).unwrap(),previous);fs::remove_file(target.join("premium-restore-pending.dpapi")).unwrap();
  api(&format!("action=backup&id={}",id),reqwest::Method::DELETE,None,Some(&source_auth.token)).await.unwrap();println!("PASS tampered ciphertext and invalid staged path rejected before changes; cloud fixture backup deleted");
  *VAULT_KEY.lock().unwrap()=None;
 }

 #[test]
 #[ignore="Invoked only by the isolated cloud roundtrip test in a new process"]
 fn premium_restart_apply_fixture(){
  assert_eq!(std::env::var("REIYA_ROUNDTRIP_RESTART").unwrap(),"1");let root=PathBuf::from(std::env::var("REIYA_ROUNDTRIP_ROOT").unwrap());assert!(root.to_string_lossy().contains("restore-verification-20261010"));assert!(data_dir().starts_with(root));assert!(VAULT_KEY.lock().unwrap().is_none());
  assert!(data_dir().join("premium-restore-pending.dpapi").exists());apply_pending_restore().unwrap();assert!(restore_preferences_path().exists());println!("PASS separate Windows process: DPAPI staged restore applied with no cached vault state; preferences queued only after file commit");
 }
}

static METADATA_AUTH:Mutex<Option<(std::time::Instant,String,Authorization)>>=Mutex::new(None);
pub(crate) async fn sync_owned_metadata(username:String,display_name:String,cookie:String,robux:i64)->Result<(),String>{
 let c=match load_credentials(){Ok(c)=>c,Err(_)=>return Ok(())};let cached={let cache=METADATA_AUTH.lock().map_err(|_|"Metadata authorization cache unavailable")?;cache.as_ref().filter(|(time,key,_)|time.elapsed().as_secs()<600&&key==&c.key).map(|(_,_,a)|a.clone())};let a=match cached{Some(a)=>a,None=>{let a=authenticate(&c,"").await?;*METADATA_AUTH.lock().map_err(|_|"Metadata authorization cache unavailable")?=Some((std::time::Instant::now(),c.key.clone(),a.clone()));a}};use sha2::Digest;let hash=sha2::Sha256::digest(cookie.as_bytes()).iter().map(|b|format!("{:02x}",b)).collect::<String>();
 api("action=metadata",reqwest::Method::POST,Some(json!({"username":username,"display_name":display_name,"robux":robux,"ownership_hash":hash})),Some(&a.token)).await?;Ok(())
}
