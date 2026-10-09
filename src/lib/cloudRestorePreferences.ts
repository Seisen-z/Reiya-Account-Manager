export function isCloudPreference(key:string){return key.startsWith("reiya_")&&key.length<100&&!/premium|token|password|cookie|license/.test(key);}
export function cloudPreferenceSnapshot(storage:Storage=localStorage):Record<string,string>{const values:Record<string,string>={};for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&isCloudPreference(key))values[key]=storage.getItem(key)||"";}return values;}
export function applyRestoredPreferences(preferences:Record<string,string>,storage:Storage=localStorage){
 if(Object.entries(preferences).some(([key,value])=>!isCloudPreference(key)||typeof value!=="string"))throw Error("Invalid cloud preference");
 const before=cloudPreferenceSnapshot(storage);
 const replace=(values:Record<string,string>)=>{for(const key of Object.keys(cloudPreferenceSnapshot(storage)))storage.removeItem(key);for(const [key,value]of Object.entries(values))storage.setItem(key,value);};
 try{replace(preferences);}catch(error){replace(before);throw error;}
}
