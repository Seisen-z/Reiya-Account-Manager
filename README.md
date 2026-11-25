# Reiya Account Manager

Reiya is a Windows desktop app for managing Roblox accounts and launching multiple Roblox instances.

## Windows upgrades

New builds use `reiya-account-manager.exe`. An update started by an older build may finish without reopening the app. In that case, open Reiya Account Manager from the Start menu.

On first launch, Reiya moves legacy accounts and settings into `%APPDATA%\Reiya` and Roblox builds into `%LOCALAPPDATA%\Reiya`. It also moves the WebView profile to the new `com.reiya.accountmanager` ID. If both locations already contain data, Reiya uses the new location and preserves the older folder.

## Reiya releases on Seisen Premium

Deploy the Seisen Premium site with its Reiya tab and release routes before cutting over desktop updates. The release workflow publishes the installer, signature, and checksum to `Seisen-z/Seisen-Premium` as `reiya-v<version>`. Set `SEISEN_PREMIUM_RELEASE_TOKEN` in this repository's Actions secrets with Contents write access to the destination repository. The updater uses the Seisen Premium download route and verifies the existing installer signature.

Publish a fresh installer build from this source. The public Reiya tab serves only signed releases built for Seisen Premium. Install the new build from https://seisen.store/reiya to use the Seisen-hosted desktop update and Premium services. After the Premium database moves, the updated app reuses the activation key and device ID saved on the same Windows profile.

## Ratings and presence deployment

Apply the Supabase migrations, then deploy `heartbeat`, `submit-rating`, `live-count`, and `rating-stats` together with the desktop update. In the hosted project, enable anonymous sign-ins and review access policies that grant permissions to the `authenticated` role. The desktop app automatically signs in and stores its refresh token using Windows DPAPI.

Legacy hardware-ID rows remain in the database. The displayed totals start with verified installation identities, and users who voted before the cutover can vote again. Older desktop versions can still read the totals after deployment. They must update to submit ratings or appear online.

The identity is tied to the saved installation session. Clearing that session or using another Windows profile can create a new identity.
