
# Profile Migration

## Triggering Approaches
### Triggered during startup by commandline
- `$ <FF_FOLDER>/firefox --migration` (on Windows `-migration`)

- Checked during XREMain::XRE_mainStartup
  - `SelectProfile` checks if "--migration" is passed in commandline, then set the migration flag @nsAppRunner.cpp
    ```cpp
    ar = CheckArg("migration", true);
    // ......
    if (ar == ARG_FOUND) {
      gDoMigration = true;
    }
    ```

    - But will be disabled if no profile found (for fresh install)
      ```cpp
      uint32_t count;
      rv = aProfileSvc->GetProfileCount(&count);

      // ......

      if (!count) {
        // For a fresh install, we would like to let users decide
        // to do profile migration on their own later after using.
        gDoMigration = false;
        gDoProfileReset = false;
      ```

  - In `XREMain::XRE_mainRun`, call the profile migrator to migrate profile
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

### Triggered by user action
- User clicks the button, which then invokes the migration wizard: `MigrationUtils.showMigrationWizard(aOpener, aParams)` @ MigrationUtils.jsm
  
### Triggered for profile reset
- https://github.com/Fischer-L/FirefoxTech/blob/master/Profile_Reset.md


## Profile Migrators
- Entry point
  - IDL: nsIProfileMigrator.idl
  - Implementation: ProfileMigrator.js
    ```
      ProfileMigrator.prototype = {
        // ProfileMigrator is REALLY just an entry point.
        // The real works are performed in MigrationUtils.
        migrate: MigrationUtils.startupMigration.bind(MigrationUtils),
        ... ...
      };
    ```
  - Usage:
    ```javascript
      // JS
      let profileMigrator = Cc["@mozilla.org/toolkit/profile-migrator;1"].createInstance(Ci.nsIProfileMigrator);
      profileMigrator.migrate(aProfileStartup, aMigratorKey, aProfileToMigrate);
    ```
    ```cpp
      // C++
      nsCOMPtr<nsIProfileMigrator> profileMigrator(do_CreateInstance(NS_PROFILEMIGRATOR_CONTRACTID));
      profileMigrator->migrate(aProfileStartup, aMigratorKey, aProfileToMigrate);
    ```
    
- `MigrationUtils.startupMigration`
  - DO NOT call it directly
    ```js
    /**
     * Show the migration wizard for startup-migration.  This should only be
     * called by ProfileMigrator (see ProfileMigrator.js), which implements
     * nsIProfileMigrator.
     * 
     * ... ...
     */
    startupMigration: function MU_startupMigrator(aProfileStartup, aMigratorKey, aProfileToMigrate) {
    ```

  - Get the browser migrator
    ```js
    if (aMigratorKey) {
      migrator = this.getMigrator(aMigratorKey);
      if (!migrator) {
        // aMigratorKey must point to a valid source, so, if it doesn't
        // cleanup and throw.
        this.finishMigration();
        throw new Error("startMigration was asked to open auto-migrate from " +
                        "a non-existent source: " + aMigratorKey);
      }
      migratorKey = aMigratorKey;
      // No need for the source page to let user chose which browser to migrate
      // since a given browser has been provided by `aMigratorKey`
      skipSourcePage = true;
    } else {
      // No given target browser. Try to locate user's default browser
      let defaultBrowserKey = this.getMigratorKeyForDefaultBrowser();
      if (defaultBrowserKey) {
        migrator = this.getMigrator(defaultBrowserKey);
        if (migrator)
          migratorKey = defaultBrowserKey;
      }
    }
    ```
    
    - `MigrationUtils.getMigrator`
      - Get mirgrator from the contractID and the `nsIBrowserProfileMigrator` interface.
        See the Migrator Interface section.
        ```js
        try {
          // All migrators should implement this contractID pattern and the interface.
          migrator = Cc["@mozilla.org/profile/migrator;1?app=browser&type=" +
                        aKey].createInstance(Ci.nsIBrowserProfileMigrator);
        } catch (ex) { Cu.reportError(ex) }
        this._migrators.set(aKey, migrator);
        ```
    
  
  
  
## Migrator Interface
- The contractID pattern:
  - "@mozilla.org/profile/migrator;1?app=browser&type=" + <MIGRATOR_KEY>
  - MIGRATOR_KEY = "ie", "edge", "chrome", etc

- The `nsIBrowserProfileMigrator` interface:
  - Implemented by `MigratorPrototype` @ MigrationUtils.jsm
    ```js
    this.MigratorPrototype = {
      QueryInterface: XPCOMUtils.generateQI([Ci.nsIBrowserProfileMigrator]),
    ```

- Example: Chrome migrator
  ```js
  function ChromeProfileMigrator() {
    // ... ...
  }
  ChromeProfileMigrator.prototype = Object.create(MigratorPrototype);
  ChromeProfileMigrator.prototype.classDescription = "Chrome Profile Migrator";
  ChromeProfileMigrator.prototype.contractID = "@mozilla.org/profile/migrator;1?app=browser&type=chrome";
  ChromeProfileMigrator.prototype.classID = Components.ID("{4cec1de4-1671-4fc3-a53e-6c539dc77a26}");
  ```

