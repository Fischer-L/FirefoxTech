# Firefox Refresh to about:welcomeback page
- During startup, ProfileMigrator.js was invoked to do migration
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
    
- In ProfileMigrator.js, it infact invokes MigrationUtils.startupMigration
  - @ MigrationUtils.startupMigration
    ```javascript
    if (aMigratorKey) {
      // Firefox migrator would be picked out because of the MOZ_APP_NAME
      migrator = this.getMigrator(aMigratorKey);
      // ......
    } else {
      // Here is the place tring to migrate from the default browser
      let defaultBrowserKey = this.getMigratorKeyForDefaultBrowser();
      if (defaultBrowserKey) {
        migrator = this.getMigrator(defaultBrowserKey);
        if (migrator) migratorKey = defaultBrowserKey;
      }
    }
    
    // ......
    
    // When doing profile refresh (reset + migrate profile), AppConstants.MOZ_APP_NAME would be passed in `XREMain::XRE_mainRun` (see above)
    let isRefresh = migrator && skipSourcePage && migratorKey == AppConstants.MOZ_APP_NAME;

    if (!isRefresh && AutoMigrate.enabled) {
      try {
        AutoMigrate.migrate(aProfileStartup, migratorKey, aProfileToMigrate);
        return;
      } catch (ex) {
        // If automigration failed, continue and show the dialog.
        Cu.reportError(ex);
      }
    }
 
    let migrationEntryPoint = this.MIGRATION_ENTRYPOINT_FIRSTRUN;
    if (isRefresh) {
      migrationEntryPoint = this.MIGRATION_ENTRYPOINT_FXREFRESH;
    }

    let params = [
      migrationEntryPoint,
      migratorKey,
      migrator,
      aProfileStartup,
      skipSourcePage,
      aProfileToMigrate,
    ];
    this.showMigrationWizard(null, params);
    ```
    
- In FirefoxProfileMigrator.js, would pull out the resources from the old profile for migration
  - @ FirefoxProfileMigrator.prototype._getResourcesInternal
    ```javascript
    // ......
    
    // Session data are pulled out here
    let sessionCheckpoints = this._getFileObject(sourceProfileDir, "sessionCheckpoints.json");
    let sessionFile = this._getFileObject(sourceProfileDir, "sessionstore.js");
    let session;
    if (sessionFile) {
      session = {
        type: types.SESSION,
        migrate(aCallback) {
          sessionCheckpoints.copyTo(currentProfileDir, "sessionCheckpoints.json");
          let newSessionFile = currentProfileDir.clone();
          newSessionFile.append("sessionstore.js");
          // When doing `SessionMigration.migrate`, "about:welcomeback" would be displayed
          let migrationPromise = SessionMigration.migrate(sessionFile.path, newSessionFile.path);
          migrationPromise.then(function() {
            let buildID = Services.appinfo.platformBuildID;
            let mstone = Services.appinfo.platformVersion;
            // Force the browser to one-off resume the session that we give it:
            Services.prefs.setBoolPref("browser.sessionstore.resume_session_once", true);
            // Reset the homepage_override prefs so that the browser doesn't override our
            // session with the "what's new" page:
            Services.prefs.setCharPref("browser.startup.homepage_override.mstone", mstone);
            Services.prefs.setCharPref("browser.startup.homepage_override.buildID", buildID);
            // It's too early in startup for the pref service to have a profile directory,
            // so we have to manually tell it where to save the prefs file.
            let newPrefsFile = currentProfileDir.clone();
            newPrefsFile.append("prefs.js");
            Services.prefs.savePrefFile(newPrefsFile);
            aCallback(true);
          }, function() {
            aCallback(false);
          });
        }
      };
    }
  
    // ......
    ```
