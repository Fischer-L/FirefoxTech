
# Profile Migration

## Triggering appraoches
### Triggered during startup
- Checked during XREMain::XRE_mainStartup
- Way #1: by commandline
  - @ static nsresult SelectProfile(...)
  - It would check if "--migration" was passed in commandline, then set the migration flag
  ```cpp
    ar = CheckArg("migration", true);
    // ......
    if (ar == ARG_FOUND) {
      gDoMigration = true;
    }
  ```
  
- Way #2: by auto-migration if no profile found (for new user)
  - @ static nsresult SelectProfile(...)
    ```cpp
      // Get profile count
      uint32_t count;
      rv = aProfileSvc->GetProfileCount(&count);
      
      // ......
      
      // Set up flags if no profile found
      if (!count) {
        gDoMigration = true;
        gDoProfileReset = false;
        // ......
      }
    ```

- Call the profile migrator to migrate profile
  - @ XREMain::XRE_mainRun()
    ```cpp
      if (mAppData->flags & NS_XRE_ENABLE_PROFILE_MIGRATOR && gDoMigration) {
        gDoMigration = false;
        nsCOMPtr<nsIProfileMigrator> pm(do_CreateInstance(NS_PROFILEMIGRATOR_CONTRACTID));
        if (pm) {
          nsAutoCString aKey;
          if (gDoProfileReset) {
            // Automatically migrate from the current application if we just reset the profile.
            aKey = MOZ_APP_NAME;
          }
          // In fact, this would invoke the JS implementation in ProfileMigrator.js
          pm->Migrate(&mDirProvider, aKey, gResetOldProfileName);
        }
      }
    ```

### Triggered manually after startup
- Invoke the migration wizard: `MigrationUtils.showMigrationWizard(aOpener, aParams)` at MigrationUtils.jsm
  

## Profile Migrators
- Entry point
  - IDL: nsIProfileMigrator.idl
  - Implementation: ProfileMigrator.js
  - Usage:
    ```javascript
      let profileMigrator = Cc["@mozilla.org/toolkit/profile-migrator;1"].createInstance(Ci.nsIProfileMigrator);
      profileMigrator.migrate(aProfileStartup, aMigratorKey, aProfileToMigrate);
    ```
    ```cpp
      nsCOMPtr<nsIProfileMigrator> profileMigrator(do_CreateInstance(NS_PROFILEMIGRATOR_CONTRACTID));
      profileMigrator->migrate(aProfileStartup, aMigratorKey, aProfileToMigrate);
    ```
    
  
