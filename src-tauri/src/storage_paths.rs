use std::{fs, path::PathBuf};

pub(super) const DATA_FOLDER: &str = "Reiya";
pub(super) const LEGACY_DATA_FOLDER: &str = "Seistem";

pub(super) fn app_root(environment_variable: &str) -> PathBuf {
    let base = std::env::var_os(environment_variable).unwrap_or_else(|| ".".into());
    let root = PathBuf::from(base).join(DATA_FOLDER);
    let _ = fs::create_dir_all(&root);
    root
}

#[cfg(any(windows, test))]
use std::{io, path::Path};

#[cfg(any(windows, test))]
fn directory_exists(path: &Path) -> io::Result<bool> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    #[cfg(windows)]
    let linked = {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    };
    #[cfg(not(windows))]
    let linked = metadata.file_type().is_symlink();

    if linked || !metadata.is_dir() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Expected a regular directory"));
    }
    Ok(true)
}

#[cfg(any(windows, test))]
fn migrate_directory(old: &Path, new: &Path) -> io::Result<()> {
    if !directory_exists(old)? {
        return Ok(());
    }
    if directory_exists(new)? {
        if fs::read_dir(new)?.next().transpose()?.is_some() {
            // Keep the current profile active and preserve the older one
            // without merging independent databases.
            eprintln!("Reiya preserved both {} and {}", old.display(), new.display());
            return Ok(());
        }
        fs::remove_dir(new)?;
    }
    fs::rename(old, new)
}

#[cfg(windows)]
pub(super) fn migrate_windows_data(app_identifier: &str) -> Result<(), String> {
    const LEGACY_APP_ID: &str = "com.seistem.reiya";
    let roaming = std::env::var_os("APPDATA").map(PathBuf::from).ok_or("APPDATA is unavailable")?;
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).ok_or("LOCALAPPDATA is unavailable")?;
    if !roaming.is_absolute() || !local.is_absolute() {
        return Err("Windows AppData locations must be absolute paths".into());
    }

    for (base, old_name, new_name) in [
        (&roaming, LEGACY_DATA_FOLDER, DATA_FOLDER),
        (&local, LEGACY_DATA_FOLDER, DATA_FOLDER),
        (&roaming, LEGACY_APP_ID, app_identifier),
        (&local, LEGACY_APP_ID, app_identifier),
    ] {
        let old = base.join(old_name);
        let new = base.join(new_name);
        if old == new {
            continue;
        }
        let mut attempt = 0;
        loop {
            match migrate_directory(&old, &new) {
                Ok(()) => break,
                Err(error) if attempt < 5 && matches!(error.raw_os_error(), Some(5 | 32 | 33)) => {
                    // WebView2 can briefly hold the profile after the old app exits.
                    attempt += 1;
                    std::thread::sleep(std::time::Duration::from_millis(200));
                }
                Err(error) => return Err(format!("Could not move {} to {}: {error}", old.display(), new.display())),
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_moves_a_profile_and_keeps_both_when_the_destination_has_data() {
        let root = std::env::temp_dir().join(format!("reiya-storage-test-{:016x}", rand::random::<u64>()));
        fs::create_dir(&root).unwrap();
        let old = root.join(LEGACY_DATA_FOLDER);
        let new = root.join(DATA_FOLDER);
        fs::create_dir(&old).unwrap();
        fs::create_dir(&new).unwrap();
        fs::write(old.join("accounts.json"), b"existing accounts").unwrap();
        fs::write(old.join("default-key.dpapi"), b"existing key").unwrap();

        migrate_directory(&old, &new).unwrap();
        migrate_directory(&old, &new).unwrap();
        assert!(!old.exists());
        assert_eq!(fs::read(new.join("accounts.json")).unwrap(), b"existing accounts");
        assert_eq!(fs::read(new.join("default-key.dpapi")).unwrap(), b"existing key");

        fs::create_dir(&old).unwrap();
        fs::write(old.join("accounts.json"), b"separate legacy data").unwrap();
        migrate_directory(&old, &new).unwrap();
        assert_eq!(fs::read(old.join("accounts.json")).unwrap(), b"separate legacy data");
        assert_eq!(fs::read(new.join("accounts.json")).unwrap(), b"existing accounts");
        fs::remove_dir_all(root).unwrap();
    }
}
