
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
     * Show the migration wizard for startup-migration. This should only be
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
    
    - `MigrationUtils.getMigratorKeyForDefaultBrowser`
      - Get user's default application for HTTP and map it to the browser we know
        ```js
        // Canary uses the same description as Chrome so we can't distinguish them.
        const APP_DESC_TO_KEY = {
          "Internet Explorer":                 "ie",
          "Microsoft Edge":                    "edge",
          "Safari":                            "safari",
          "Firefox":                           "firefox",
          "Nightly":                           "firefox",
          "Google Chrome":                     "chrome",  // Windows, Linux
          "Chrome":                            "chrome",  // OS X
          "Chromium":                          "chromium", // Windows, OS X
          "Chromium Web Browser":              "chromium", // Linux
          "360\u5b89\u5168\u6d4f\u89c8\u5668": "360se",
        };

        let key = "";
        try {
          let browserDesc = Cc["@mozilla.org/uriloader/external-protocol-service;1"]
                            .getService(Ci.nsIExternalProtocolService).getApplicationDescription("http");
          key = APP_DESC_TO_KEY[browserDesc] || "";
          // Handle devedition, as well as "FirefoxNightly" on OS X.
          if (!key && browserDesc.startsWith("Firefox")) {
            key = "firefox";
          }
        } catch (ex) {
          Cu.reportError("Could not detect default browser: " + ex);
        }
        
        // ... ...
        
        return key;
        ```
      
  - Check if we are doing profile refresh
    ```js 
    // If comes here because of profile refresh, `migratorKey` will be `MOZ_APP_NAME`.
    // So very important not to call `MigrationUtils.startupMigration` directly
    let isRefresh = migrator && skipSourcePage && migratorKey == AppConstants.MOZ_APP_NAME;
    ```
    
    - Only do auto migration if it is enabled and this is not profile refresh
      ```js
      if (!isRefresh && AutoMigrate.enabled) {
        try {
          AutoMigrate.migrate(aProfileStartup, migratorKey, aProfileToMigrate);
          return;
        } catch (ex) {
          // If automigration failed, continue and show the dialog.
          Cu.reportError(ex);
        }
      }
      ```
    
  - Bring up the migration wizard
    ```js
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
  
- `MigrationUtils.showMigrationWizard`
  ```js
  Services.ww.openWindow(aOpener,
                         "chrome://browser/content/migration/migration.xul",
                         "_blank",
                         features,
                         params);
  ```

- browser/components/migration/content/migration.xul
  ```xml
  <wizard id="migrationWizard"
          xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
          windowtype="Browser:MigrationWizard"
          title="&migrationWizard.title;"
          onload="MigrationWizard.init()"
          onunload="MigrationWizard.uninit()"
          style="width: 40em;"
          buttons="accept,cancel"
          branded="true">
    <script type="application/javascript" src="chrome://browser/content/migration/migration.js"/>
  ```
  
  - XBL: /toolkit/content/widgets/wizard.xml
  
  - Page advance and rewind
    Each `<wizardpage>` should handle event on page advancing/rewinding
    ```xml
    // ... ...
    
    <wizardpage id="importSource" pageid="importSource" next="selectProfile"
                label="&importSource.title;"
                onpageadvanced="return MigrationWizard.onImportSourcePageAdvanced();">
      // ... ...
    </wizardpage>
    
    <wizardpage id="selectProfile" pageid="selectProfile" label="&selectProfile.title;"
                next="importItems"
                onpageshow="return MigrationWizard.onSelectProfilePageShow();"
                onpagerewound="return MigrationWizard.onSelectProfilePageRewound();"
                onpageadvanced="return MigrationWizard.onSelectProfilePageAdvanced();">
      // ... ...
    </wizardpage>

    <wizardpage id="importItems" pageid="importItems" label="&importItems.title;"
                next="homePageImport"
                onpageshow="return MigrationWizard.onImportItemsPageShow();"
                onpagerewound="return MigrationWizard.onImportItemsPageRewound();"
                onpageadvanced="return MigrationWizard.onImportItemsPageAdvanced();"
                oncommand="MigrationWizard.onImportItemCommand();">
      // ... ...
    </wizardpage>
    
    // ... ...
    ```
    
    - Advance to the next page: call `advance` of `<wizard>`
      - `pagehide` event is fired on the `currentPage`, then
      - `pageadvanced` event is fired on the `currentPage`, then
      - let `currentPage` be the next page, then
      - `pageshow` event is fired on the `currentPage`
      
    - Rewind to the previous page: call `rewind` of `<wizard>`
      - `pagehide` event is fired on the `currentPage`, then
      - `pagerewound` event is fired on the `currentPage`, then
      - `wizardback` event is fired on the `<wizard>`, then
      - let `currentPage` be the previous page, then
      - `pageshow` event is fired on the `currentPage`

- `MigrationWizard.init` @ migration.js
  - Start the 1st migration wizard page
    ```js
    this.onImportSourcePageShow();
    ```

- `MigrationWizard.onMigratingPageShow`
  - Decide the import items for user in auto migration
    ```js
    // When automigrating, show all of the data that can be received from this source.
    if (this._autoMigrate)
      this._itemsFlags = this._migrator.getMigrateData(this._selectedProfile, this._autoMigrate);
    ```
    
- `MigrationWizard.onMigratingMigrate`
  - Start migration
    ```js
    this._migrator.migrate(this._itemsFlags, this._autoMigrate, this._selectedProfile);
    ```

- `Migrator.Prototype.migrate`
  - Get resources to migrate from other browser
    ```js
    let resources = this._getMaybeCachedResources(aProfile);
    if (resources.length == 0)
      throw new Error("migrate called for a non-existent source");
    ```
    
    - `MigratorPrototype._getMaybeCachedResources`
      - All browser migrators should implement `getResources` to get import resources.
        ```js
        // One resource is an obj of {
        //   type: Indicate what type this resource is,
        //   migrate(aCallback): Method in charge of importing actual files/data
        // }
        this._resourcesByProfile[profileKey] = this.getResources(aProfile);
        ```
        
      - See the ChromeProfileMigrator section for Chrome example
   
  - Filter out the resources we want
    ```js
    if (aItems != Ci.nsIBrowserProfileMigrator.ALL)
      resources = resources.filter(r => aItems & r.type);
    ```
     
    - The Supported resource types
      ```js
      MigrationUtils.resourceTypes = {
        // ALL:     Ci.nsIBrowserProfileMigrator.ALL
        SETTINGS:   Ci.nsIBrowserProfileMigrator.SETTINGS,
        COOKIES:    Ci.nsIBrowserProfileMigrator.COOKIES,
        HISTORY:    Ci.nsIBrowserProfileMigrator.HISTORY,
        FORMDATA:   Ci.nsIBrowserProfileMigrator.FORMDATA,
        PASSWORDS:  Ci.nsIBrowserProfileMigrator.PASSWORDS,
        BOOKMARKS:  Ci.nsIBrowserProfileMigrator.BOOKMARKS,
        OTHERDATA:  Ci.nsIBrowserProfileMigrator.OTHERDATA,
        SESSION:    Ci.nsIBrowserProfileMigrator.SESSION,
      }
      ```
      
  - Before migrating, Import the default bookmarks if this migration is during startup and not from the old FF profile
    ```js
     if (MigrationUtils.isStartupMigration && !this.startupOnlyMigrator) {
       MigrationUtils.profileStartup.doStartup();
       // First import the default bookmarks.
       // Note: We do not need to do so for the Firefox migrator(=startupOnlyMigrator),
       // as it just copies over the places database from another profile.
       (async function() {
        // ... ...
 
        // Import the default bookmarks[1]. We ignore whether or not we succeed.
        await BookmarkHTMLUtils.importFromURL(
          "chrome://browser/locale/bookmarks.html", true).catch(r => r);
    
        // We'll tell nsBrowserGlue we've imported bookmarks, but before that
        // we need to make sure we're going to know when it's finished initializing places
        let placesInitedPromise = new Promise(resolve => {
          let onPlacesInited = function() {
            Services.obs.removeObserver(onPlacesInited, TOPIC_PLACES_DEFAULTS_FINISHED);
            resolve();
          };
          Services.obs.addObserver(onPlacesInited, TOPIC_PLACES_DEFAULTS_FINISHED);
        });
        // This will tell `browserGlue` we've imported bookmarks.
        // Have `browserGlue` know time to call `BrowserGlue.prototype._initPlaces`
        browserGlue.observe(null, TOPIC_DID_IMPORT_BOOKMARKS, "");
        await placesInitedPromise;
        doMigrate();
       })();
       return;
     }
     doMigrate();
    ```
     
    [1] The default bookmarks template: browser/locales/generic/profile/bookmarks.html.in
     
    - `BookmarkHTMLUtils.importFromURL`
      ```js
      let importer = new BookmarkImporter(aInitialImport);
      await importer.importFromURL(aSpec);
      ```
      
      - `BookmarkImporter.prototype.importFromURL`
        This will load default bookmarks.html, then walk the DOM to get bookmark trees
        
      - `BookmarkImporter.prototype._importFromURL`
        ```js
        // Insert bookmark into the places db
        await PlacesUtils.bookmarks.insertTree(tree);
        ```
    - `doMigrate`
      ```js
      // ... ...
      
      for (let [migrationType, itemResources] of resourcesGroupedByItems) {
        // Start measuring the telemetry about migration time we spent
        let stopwatchHistogramId = maybeStartTelemetryStopwatch(migrationType);
        let {responsivenessMonitor, responsivenessHistogramId} = maybeStartResponsivenessMonitor(migrationType);
        // Loop resource obj one by one 
        for (let res of itemResources) {
          let completeDeferred = PromiseUtils.defer();
          let resourceDone = function(aSuccess) {
            itemResources.delete(res);
            itemSuccess |= aSuccess;
            if (itemResources.size == 0) {
              // ... ...
              
              // Send the telmetry back
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
          
          // Finally we start migrating stuff...
          try {
            res.migrate(resourceDone); // See ChromeProfileMigrator section for example
          } catch (ex) {
            Cu.reportError(ex);
            resourceDone(false);
          }
          
          // ... ...
          
          // This is important!!!
          // Importing is expensive. We have to yeild the way!!! 
          // `unblockMainThread` will queue the next loop into the main thread.
          await unblockMainThread();
        }
      }
      ```
      
      - `unblockMainThread`
        ```js
        // Used to periodically give back control to the main-thread loop.
        let unblockMainThread = function() {
          return new Promise(resolve => {
            Services.tm.dispatchToMainThread(resolve);
          });
        };
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


## ChromeProfileMigrator
- Initialization
  - Get Chrome's profile folder
    ```js
    function ChromeProfileMigrator() {
      // `getDataFolder` returns an nsIFile instance of profiles on Windows or OSX or *nix system
      let chromeUserDataFolder = getDataFolder(["Google", "Chrome"], ["Google", "Chrome"], ["google-chrome"]);
      this._chromeUserDataFolder = chromeUserDataFolder.exists() ? chromeUserDataFolder : null;
    }
    ```
  
- `ChromeProfileMigrator.prototype.getResources`
  ```js
  // Clone Chrome's profile first. We don't want to mess the original one.
  let profileFolder = this._chromeUserDataFolder.clone();
  profileFolder.append(aProfile.id);
  // Lets get Chrome's resources!!!
  if (profileFolder.exists()) {
    let possibleResources = [
      GetBookmarksResource(profileFolder),
      GetHistoryResource(profileFolder),
      GetCookiesResource(profileFolder),
    ];
    if (AppConstants.platform == "win") {
      possibleResources.push(GetWindowsPasswordsResource(profileFolder));
    }
    return possibleResources.filter(r => r != null);
  }
  ```

  - `GetBookmarksResource`
    ```js
    function GetBookmarksResource(aProfileFolder) {
      let bookmarksFile = aProfileFolder.clone();
      bookmarksFile.append("Bookmarks");
      if (!bookmarksFile.exists()) return null;
      return {
        type: MigrationUtils.resourceTypes.BOOKMARKS,
        migrate(aCallback) { // ... ... }
      };
    }
    ```
    
-
