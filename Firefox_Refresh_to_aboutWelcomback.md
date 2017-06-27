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
    
- Then the call of `showMigrationWizard` would open the migration wizard window
  - @ MigrationUtils.showMigrationWizard
    ```javascript
    Services.ww.openWindow(
      aOpener,
      "chrome://browser/content/migration/migration.xul",
      "_blank", features, params);
    ```
    
- The migration wizard window, them would advance stage by stage to go through the migration setup steps
  - @ MigrationWizard.onMigratingMigrate
    ```javascript
    // Start migrating resources
    this._migrator.migrate(this._itemsFlags, this._autoMigrate, this._selectedProfile);
    ```
    
- The migrator inheriting `MigratorPrototype` now is doign migration
  - @ MigratorPrototype.migrate
    ```javascript
    // This would retrieve resourcecs of all types to migration from.
    let resources = this._getMaybeCachedResources(aProfile);
    
    // ......
    
    // Called either directly or through the bookmarks import callback.
    let doMigrate = async function() {
      let resourcesGroupedByItems = new Map();
      resources.forEach(function(resource) {
        if (!resourcesGroupedByItems.has(resource.type)) {
          resourcesGroupedByItems.set(resource.type, new Set());
        }
        resourcesGroupedByItems.get(resource.type).add(resource);
      });

      if (resourcesGroupedByItems.size == 0)
        throw new Error("No items to import");

      let notify = function(aMsg, aItemType) {
        Services.obs.notifyObservers(null, aMsg, aItemType);
      };

      for (let resourceType of Object.keys(MigrationUtils._importQuantities)) {
        MigrationUtils._importQuantities[resourceType] = 0;
      }
      notify("Migration:Started");
      
      // Loop thorugh each resource and invoke resource to do migrate here
      for (let [migrationType, itemResources] of resourcesGroupedByItems) {
        notify("Migration:ItemBeforeMigrate", migrationType);

        let stopwatchHistogramId = maybeStartTelemetryStopwatch(migrationType);

        let {responsivenessMonitor, responsivenessHistogramId} =
          maybeStartResponsivenessMonitor(migrationType);

        let itemSuccess = false;
        for (let res of itemResources) {
          let completeDeferred = PromiseUtils.defer();
          let resourceDone = function(aSuccess) {
            itemResources.delete(res);
            itemSuccess |= aSuccess;
            if (itemResources.size == 0) {
              notify(itemSuccess ?
                     "Migration:ItemAfterMigrate" : "Migration:ItemError",
                     migrationType);
              resourcesGroupedByItems.delete(migrationType);

              if (stopwatchHistogramId) {
                TelemetryStopwatch.finishKeyed(stopwatchHistogramId, browserKey);
              }

              maybeFinishResponsivenessMonitor(responsivenessMonitor, responsivenessHistogramId);

              if (resourcesGroupedByItems.size == 0) {
                collectQuantityTelemetry();
                notify("Migration:Ended");
              }
            }
            completeDeferred.resolve();
          };

          // If migrate throws, an error occurred, and the callback
          // (itemMayBeDone) might haven't been called.
          try {
            res.migrate(resourceDone);
          } catch (ex) {
            Cu.reportError(ex);
            resourceDone(false);
          }

          // Certain resources must be ran sequentially or they could fail,
          // for example bookmarks and history (See bug 1272652).
          if (migrationType == MigrationUtils.resourceTypes.BOOKMARKS ||
              migrationType == MigrationUtils.resourceTypes.HISTORY) {
            await completeDeferred.promise;
          }

          await unblockMainThread();
        }
      }
    };
    
    // ......
    
    doMigrate();
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
          // The SessionMigration would make about:welcomback page as the startup entry page.
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

- The SessionMigration would make about:welcomback page as the startup entry page
  - @ SessionMigration.migrate
    ```javascript
      let inState = await SessionMigrationInternal.readState(aFromPath);
      // The about:welcomback page would be added btw when coverting the out state
      let outState = SessionMigrationInternal.convertState(inState);
      // Unfortunately, we can't use SessionStore's own SessionFile to
      // write out the data because it has a dependency on the profile dir
      // being known. When the migration runs, there is no guarantee that
      // that's true.
      await SessionMigrationInternal.writeState(aToPath, outState);
    ```
    
- Reading out the old sessions
  - @ SessionMigrationInternal.convertState
    ```javascript
    // ......
    
    // Add the about:welcomback page as the entry page for session restore
    // so that on the 1st startup, it would show the about:welcomback page.
    let url = "about:welcomeback";
    let formdata = {id: {sessionData: state}, url};
    let entry = { url, triggeringPrincipal_base64: Utils.SERIALIZED_SYSTEMPRINCIPAL };
    return { windows: [{ tabs: [{ entries: [ entry ], formdata}]}]};
    ```
