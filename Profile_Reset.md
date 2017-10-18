# Profile Reset (Refresh)

## Reset by commandline
- `$ <FF_FOLDER>/firefox --reset-profile [--migration]` (On Windows -reset-profile [-migration])
  - `XREMain::XRE_main` calls `XREMain::XRE_mainStartup`
  
  - `aProfileSvc` is created and passed @ XREMain::XRE_mainStartup
     ```cpp
     rv = NS_NewToolkitProfileService(getter_AddRefs(mProfileSvc));

     // ......

     rv = SelectProfile(getter_AddRefs(mProfileLock), mProfileSvc, mNativeApp, &mStartOffline, &mProfileName);
     ```
     
  - `SelectProfile` @ nsAppRunner.cpp
    - Check commandline arg
      ```cpp
      ar = CheckArg("reset-profile", true);
      if (ar == ARG_BAD) {
        PR_fprintf(PR_STDERR, "Error: argument --reset-profile is invalid when argument --osint is specified\n");
        return NS_ERROR_FAILURE;
      }
      if (ar == ARG_FOUND) {
        gDoProfileReset = true;
      }
      ```
    
    - Get old profile name
      ```cpp
      arg = PR_GetEnv("XRE_PROFILE_NAME");
      if (arg && *arg && aProfileName) {
        aProfileName->Assign(nsDependentCString(arg));
        if (gDoProfileReset) {
          gResetOldProfileName.Assign(*aProfileName);
        }
      }
      ```
    
    - Create new profile
      ```cpp
      if (gDoProfileReset) {
        // If we're resetting a profile, create a new one and use it to startup.
        nsCOMPtr<nsIToolkitProfile> newProfile;
        rv = CreateResetProfile(aProfileSvc, gResetOldProfileName, getter_AddRefs(newProfile));
        if (NS_SUCCEEDED(rv)) {
          rv = newProfile->GetRootDir(getter_AddRefs(lf));
          NS_ENSURE_SUCCESS(rv, rv);
          SaveFileToEnv("XRE_PROFILE_PATH", lf);

          rv = newProfile->GetLocalDir(getter_AddRefs(localDir));
          NS_ENSURE_SUCCESS(rv, rv);
          SaveFileToEnv("XRE_PROFILE_LOCAL_PATH", localDir);

          rv = newProfile->GetName(*aProfileName);
          if (NS_FAILED(rv)) aProfileName->Truncate(0);
          SaveWordToEnv("XRE_PROFILE_NAME", *aProfileName);
        } else {
          NS_WARNING("Profile reset failed.");
          gDoProfileReset = false;
        }
      }
      ```

      - `CreateResetProfile` @ ProfileReset.cpp
        - Reuse the old profile name if available
          ```cpp
          nsAutoCString newProfileName;
          if (!aOldProfileName.IsEmpty()) {
            newProfileName.Assign(aOldProfileName);
            newProfileName.Append("-");
          } else {
            newProfileName.AssignLiteral("default-");
          }
          newProfileName.Append(nsPrintfCString("%" PRId64, PR_Now() / 1000));
          ```
          
        - Create new profile
          ```cpp
          nsresult rv = aProfileSvc->CreateProfile(nullptr, // choose a default dir for us
                                                   newProfileName,
                                                   getter_AddRefs(newProfile));
          ```

  - Back to `XREMain::XRE_main` calls `XREMain::XRE_mainRun`

  - Import data from the old profile @ `XREMain::XRE_mainRum`
    - run if did `$ <FF_FOLDER>/firefox --reset-profile --migration` (On Windows -reset-profile -migration)
    - See https://github.com/Fischer-L/FirefoxTech/blob/master/Profile_Migration.md

  - Backup the old profile @ `XREMain::XRE_mainRum`
    ```cpp
    if (gDoProfileReset) {
      // `ProfileResetCleanup` will backup then delete the old profile
      nsresult backupCreated = ProfileResetCleanup(profileBeingReset);
      if (NS_FAILED(backupCreated)) NS_WARNING("Could not cleanup the profile that was reset");

      nsCOMPtr<nsIToolkitProfile> newProfile;
      rv = GetCurrentProfile(mProfileSvc, mProfD, getter_AddRefs(newProfile));
      if (NS_SUCCEEDED(rv)) {
        // After the old profile is deleted, we can restore the profile name.
        // (We are reseting not creating an new one so keep the old name)
        newProfile->SetName(gResetOldProfileName);
        mProfileName.Assign(gResetOldProfileName);
        // Set the new profile as the default after we're done cleaning up the old profile,
        // iff that profile was already the default
        if (profileWasSelected) {
          rv = mProfileSvc->SetDefaultProfile(newProfile);
          if (NS_FAILED(rv)) NS_WARNING("Could not set current profile as the default");
        }
      } else {
        NS_WARNING("Could not find current profile to set as default / change name.");
      }

      // Need to write out the fact that the profile has been removed, the new profile
      // renamed, and potentially that the selected/default profile changed.
      mProfileSvc->Flush();
    }
    ```

  - `nsToolkitProfileService::Flush`
    - Flush the update records into the profile.ini file
  
  
## Reset by terminal MOZ_RESET_PROFILE_RESTART env arg
  - When click the Refresh button in about:support, `ResetProfile.openConfirmationDialog` is called
  
  - `ResetProfile.openConfirmationDialog` @ ResetProfile.jsm
    - Open the dialog to confirm with user
      ```js
      window.openDialog("chrome://global/content/resetProfile.xul", null, 
                        "chrome,modal,centerscreen,titlebar,dialog=yes", params);
      ```
  
    - Set MOZ_RESET_PROFILE_RESTART env ar then restart Firefox
      ```js
      // Set the reset profile environment variable.
      let env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
      env.set("MOZ_RESET_PROFILE_RESTART", "1");
      // Restart
      let appStartup = Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup);
      appStartup.quit(Ci.nsIAppStartup.eForceQuit | Ci.nsIAppStartup.eRestart);
      ```
  
  - During startup `SelectProfile` @ nsAppRunner.cpp
    - Detecs the env arg then set the global variable
      ```cpp
      if (EnvHasValue("MOZ_RESET_PROFILE_RESTART")) {
        gDoProfileReset = true;
        gDoMigration = true;
        SaveToEnv("MOZ_RESET_PROFILE_RESTART=");
        // We only want to restore the previous session if the profile refresh was
        // triggered by user. And if it was a user-triggered profile refresh
        // through, say, the safeMode dialog or the troubleshooting page, the MOZ_RESET_PROFILE_RESTART
        // env variable would be set. Hence we set MOZ_RESET_PROFILE_MIGRATE_SESSION here so that
        // Firefox profile migrator would migrate old session data later.
        SaveToEnv("MOZ_RESET_PROFILE_MIGRATE_SESSION=1");
      }
      ```
      
  - See the section of Reset by commandline for the rest
      
