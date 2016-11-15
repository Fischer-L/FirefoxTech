# FirefoxTech
 
## Printing Strings
- xxxCString means 8-bit character strings, others 16-bit

- JS string is 16-bit but C++ sting is 8 bit

- UTF-8 <--> UTF-16 in Gecko
  - NS_ConvertUTF16toUTF8 is a class inheriting nsAutoCString and receives nsAString& for constructing
  - NS_ConvertUTF8toUTF16 is a class inheriting nsAutoString and receives nsACString& for constructing

- How to print string
  1. Create UTF-8 string from UTF-16 string (skip if already UTF-8)
  
     ```c++
       NS_ConvertUTF16toUTF8 a_ns_c_string(a_ns_a_string)
     ```
     
  2. Get char_type* to print
  
     ```c++
       fprintf(stderr, "%s", a_ns_c_string.get());
     ```


## tabbrowser / browser / tabs / tab
* @browser/base/content/browser.xul

* ###Tabbrowser
 - Bindings: browser/base/content/tabbrowser.xml#tabbrowser
 - This element contains `<browser>`
 - `this.selectedBrowser` is `<browser>`
 - `this.tabContainer` is `<tabs>` but `<tabs>` is not under `<tabbrowser>` in the DOM tree
 - This element even manage tabs so, for example of adding a tab, call `this.addTab`

* ###browser
 - Under `<tabbrowser>` in the DOM tree
 - Similar to `<iframe>` except that it holds a page history and contains additional methods to manipulate the currently displayed page.
 - Website is rendered inside `<browser>`
 
* ###tabs
 - This element contains `<tab>` in the DOM tree
 
 ![tabs image](https://raw.githubusercontent.com/Fischer-L/FirefoxTech/master/img/tabs.png)
  
* ###tab
 - A single tab 
 
  ![tab image](https://raw.githubusercontent.com/Fischer-L/FirefoxTech/master/img/tab.png)
 
 
##Where is the update history record stored
Look for active-update.xml, updates.xml, and updates folder under 

###In MAC
- Developer Edition update records dir: "/Users/USERNAME/Library/Caches/Mozilla/updates/Applications/FirefoxDeveloperEdition"
- Mach-built browser update files dir: /Users/USERNAME/Library/Caches/Mozilla/updates/Users/foxbrush/Projects/gecko/objdir-frontend/dist/Nightly

### In Linux
- Mach-built browser update records dir: /home/fischer/Projects/gecko/objdir-front-end/dist/bin
 
 
## How to load JS file as JSM module
1. Create the target JS file, like, browser/base/content/sanitize.js
  ```javascript
  // Include some JSMs

  function Sanitizer() {
    // Do what we want...
  }
  ```
  
2. Register sanitize.js in broswer/base/jar.mn 
  ```
  # Other files declaratons...
  content/browser/sanitize.js     (content/sanitize.js)
  # Other files declaratons...
  ```
  
3. Create a JSM module to load the target JS file, like, browser/modules/Sanitizer.jsm:
  ```javascript
  "use strict";

  this.EXPORTED_SYMBOLS = ["Sanitizer"];

  const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

  var scope = {};
  Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader)
    .loadSubScript("chrome://browser/content/sanitize.js", scope);

  this.Sanitizer = scope.Sanitizer;
  ```

4. Register Sanitizer.jsm in browser/modules/moz.build
  ```javascript
  EXTRA_JS_MODULES += [
    // other JSMs...
    'Sanitizer.jsm',
    // other JSMs...
  ]
  ```


## How to inject a mock JS XPCOM component
```javascript
    // Set up
    const { classes: Cc, interfaces: Ci, manager: Cm, utils: Cu, results: Cr } = Components;
    Cu.import('resource://gre/modules/XPCOMUtils.jsm');
    const uuidGenerator = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);

    // Declare mock component
    const mockUpdateManager = {
      
      // Implement XPCOM interface
      QueryInterface: XPCOMUtils.generateQI([Ci.nsIUpdateManager]),
    
      createInstance: function(outer, iiD) {
        if (outer) {
          throw Cr.NS_ERROR_NO_AGGREGATION;
        }
        return this.QueryInterface(iiD);
      },
      // Implement XPCOM interface end

      // Help methods and properties 
      contractId: "@mozilla.org/updates/update-manager;1",
    
      _mockClassId: uuidGenerator.generateUUID(),
    
      _originalClassId: "",
    
      _originalFactory: null,
    
      register: function () {
        let registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
        if (!registrar.isCIDRegistered(this._mockClassId)) {
          this._originalClassId = registrar.contractIDToCID(this.contractId);
          this._originalFactory = Cm.getClassObject(Cc[this.contractId], Ci.nsIFactory);
          registrar.unregisterFactory(this._originalClassId, this._originalFactory);
          registrar.registerFactory(this._mockClassId, "Unregister after testing", this.contractId, this);
        }
      },
    
      unregister: function () {
        let registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
        registrar.unregisterFactory(this._mockClassId, this);
        // Restoring the original component is important
        registrar.registerFactory(this._originalClassId, "", this.contractId, this._originalFactory);
      },
      // Help methods and properties end

     // The mock methods or properties for testing
    };

    // First register mock component    
    mockUpdateManager.register();

    // Do test....

    // Finally unregister 
    mockUpdateManager.unregister();
```


## How to redirect about: page to a real page
The mapping tables are at
- browser/components/about/AboutRedirector.cpp
- docshell/base/nsAboutRedirector.cpp


## How accesskey is handled
### Register accesskey
1. Element registers accesskey on init or at attrribute changed
 - For example, at nsGenericHTMLElement::RegUnRegAccessKey and at nsXULLabelFrame::RegUnregAccessKey, would call EventStateManager::RegisterAccessKey
 - Please seach RegUnRegAccessKey and RegUnregAccessKey for more elements
 
2. EventStateManager saves registered elements
 - At EventStateManager::RegisterAccessKey, elements would be stored at mAccessKeys
 
### Dispatching
1. Handle accesskey event
 - EventStateManager::HandleAccessKey handles accesskey event, would call EventStateManager::ExecuteAccessKey
 
2. Find out the right accesskey target element
 - At EventStateManager::ExecuteAccessKey, would loop registered elements inside mAccessKeys to find the right target
 
3. Turn accesskey into click event
 - At EventStateManager::ExecuteAccessKey, once find the accesskey target element call PerformAccesskey on the target element
 - For example, at nsGenericHTMLElement::PerformAccesskey, would call DispatchSimulatedClick to dispatch a simulated click event
 - For example, at nsXULElement::PerformAccesskey, would call ClickWithInputSource to dispatch simulated mouse events
 
4. Element receives click event and perform jobs.

## How does notification popup for permission request show
1. @nsContentPermissionUtils::AskPermission, would call nsIContentPermissionRequest::GetTypes to get permission array for types
 ```cpp
 nsresult rv = aRequest->GetTypes(getter_AddRefs(typeArray));
 ```

2. @nsIContentPermissionRequest::GetTypes implementation
 - such as nsGeolocationRequest::GetTypes would call nsContentPermissionUtils::CreatePermissionArray to create permission array for types

3. @nsContentPermissionUtils::AskPermission, after  preparation, would call RemotePermissionRequest::Sendprompt
 ```cpp
 req->Sendprompt();
 ```

4. @nsBrowserGlue.js,
 - ContentPermissionPrompt.prompt decides to show, say geolocation, desktop-notification, flyweb-publish-server, which permission popup, then, ContentPermissionPrompt._showPrompt would call PopupNotifications.show
 - In ContentPermissionPrompt._showPrompt, the request would be recorded by
  ```cpp
  Services.perms.addFromPrincipal(.....)
  ```
 - the getter of PopupNotifications is at browser.js
  ```cpp
  XPCOMUtils.defineLazyGetter(this, "PopupNotifications", …
  ```
 - PopupNotifications is defined at toolkit/modules/PopupNotifications.jsm

5. @browser.xul
 - would include notification popup UI: panel#notification-popup
  ```
  #include popup-notifications.inc
  ```
  The file is at browser/base/content/popup-notifications.inc 
 - the XBL binding for panel#notification-popup is at toolkit/content/widgets/popup.xml#arrowpanel


## How to make a prompt
1. Get the nsIPromptService service
 ```javascript
 var promptSvc = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                          .getService(Components.interfaces.nsIPromptService);
 ```
 
 - The nsIPromptService is defined at
   - toolkit/components/prompts/src/nsPrompter.js
   - embedding/components/windowwatcher/nsIPromptService.idl
   - embedding/components/windowwatcher/nsIPromptService2.idl

2. Call
 - promptSvc.confirm for simple OK/Cancel prompt
 - promptSvc.confirmEx for different button labels prompt (by using flags param)
 - etc…
   ```javascript
     var flags = 
       // This says the right-most button label is a given string 
       (Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0) + 
     
       // This says the middle button label is the system "CANCEL" string
       (Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1) + 
     
       // This says the left-most button label is the system "OK" string
       // If no button 2, just eliminate this line
       (Services.prompt.BUTTON_TITLE_OK * Services.prompt.BUTTON_POS_2) + 
     
       // This says the default button is the right-most button
       Services.prompt.BUTTON_POS_0_DEFAULT;
   
     // The button 1 and 2 use system button labels so just set null
     var btnLabels = [ "Button 0 Label", null, null ];
   
     // If no checkbox, set to null
     var checkBoxLabel = "This is a checkbox";
   
     // If no checkBoxLabel, would be ignored.
     // If the provided value is TRUE and user unchecks, then it will become FALSE.
     var checkBoxValue = { value : true };
   
     // It user clicks the button 0, then the result is 0. If clicking the button 1, then 1 returned...
     var result = Services.prompt.confirmEx(
        window, "Prompt Title", "Prompt descriptions", flags, 
        btnLabels[0], btnLabels[1], btnLabels[2], checkBoxLabel, checkBoxValue
     );
   ```

3. Customized prompt
  - Use `Window.openDialog` [1]
  - Example: PlacesUIUtils.showBookmarkDialog [2]

  [1] https://developer.mozilla.org/en-US/docs/Web/API/Window/openDialog
  
  [2] https://dxr.mozilla.org/mozilla-central/source/browser/components/places/PlacesUIUtils.jsm#638

## What is the flag defining the RELEASE and BETA build
- RELEASE_OR_BETA def
- In toolkit/modules/AppConstants.jsm, the AppConstants holds the build flag, like, NIGHTLY_BUILD, RELEASE_OR_BETA etc.
- https://wiki.mozilla.org/Platform/Channel-specific_build_defines


## eTLD
- The IDL is at netwerk/dns/nsIEffectiveTLDService.idl
- The service implementation is at netwerk/dns/nsEffectiveTLDService.cpp
- The contract is 
  - Components.classes["@mozilla.org/network/effective-tld-service;1"].getService(Components.interfaces.nsIEffectiveTLDService);
  - XPCOMUtils.defineLazyServiceGetter({}, "@mozilla.org/network/effective-tld-service;1", "nsIEffectiveTLDService"); 
- Accessible from Services.eTLD at Services.jsm


## How dose mPermissionTable get put entries
1. nsPermissionManager::Init [1]
2.  nsPermissionManager::InitDB [2]
3. nsPermissionManager::Import [3]
   => Here import permission file
4. nsPermissionManager::_DoImport [4]
   => Here, read line，loop permissions
   
    4-1. Go with UpgradeHostToOriginAndInsert then AddInternal [5] -> [6] -> [7]
  
    or
  
    4-2 Directly call AddInterna [8]

[1] https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.cpp#787

[2] https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.cpp#843

[3] https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.cpp#2608

[4] https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.cpp#2668

[5] https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.cpp#2722

[6] https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.cpp#425

[7] https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.cpp#285

[8] https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.cpp#2747


## Where is http cahce stored
- Check out about:cache


## How to remove http cache by uri
1. Get nsICacheStorageService [1][2]. Accessible thru `Services.cache2` [3].

2. Get cache storage [4][5] of disk and of memory thru nsICacheStorageService.
  ```javascript
  var memStorage = Services.cache2.memoryCacheStorage(LoadContextInfo.default);
  var diskStorage = Services.cache2.diskCacheStorage(LoadContextInfo.default, false);
  ```
  
3. Enum caches to filter out target cache by uri and then remove
  ```javascript
  const TARGET_HOST = "www.foo.com";
  var getVisitor = function (storage) {
    var _targets = [];
    return { // This is nsICacheStorageVisitor[6]
      onCacheEntryInfo: function (uri, IdEnhance, dataSize, fetchCount, lastModified, expire, pinned) {
       if (uri.host == TARGET_HOST) _targets.push({ uri: uri, idEnhance: idEnhance });
      },
      onCacheEntryVisitCompleted: function () {
        _targets.forEach(t => {
          store.asyncDoomURI(t.uri, t.IdEnhance, { // This is nsICacheEntryDoomCallback [7]
            onCacheEntryDoomed: function (errCode) { }
          });
        });
      }
    };
  };
  memStorage.asyncVisitStorage(getVisitor(memStorage), true);
  diskStorage.asyncVisitStorage(getVisitor(diskStorage), true);
  ```

[1] https://dxr.mozilla.org/mozilla-central/source/netwerk/cache2/CacheStorageService.cpp

[2] https://dxr.mozilla.org/mozilla-central/source/netwerk/cache2/nsICacheStorageService.idl

[3] https://dxr.mozilla.org/mozilla-central/source/toolkit/modules/Services.jsm

[4] https://dxr.mozilla.org/mozilla-central/source/netwerk/cache2/CacheStorage.cpp

[5] https://dxr.mozilla.org/mozilla-central/source/netwerk/cache2/nsICacheStorage.idl

[6] https://dxr.mozilla.org/mozilla-central/source/netwerk/cache2/nsICacheStorageVisitor.idl

[7] https://dxr.mozilla.org/mozilla-central/source/netwerk/cache2/nsICacheEntryDoomCallback.idl


## Align element in XUL
- Vertical Alignment:   use `hbox` with `align` attribute or `-moz-box-align` CSS property
- Horizontal Alignment: use `vbox` with `align` attribute or `-moz-box-align` CSS property

[1] https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Attribute/align


## How to get app cache usage of each origin
```javascript
var appCaches = {
  perms: [],
  usages: []
};

// 1. Get nsIPermissionManager
var pm = Components.classes["@mozilla.org/permissionmanager;1"].getService(Components.interfaces.nsIPermissionManager);

// 2. Get permission enumeraotr
var enumerator = pm.enumerator;

// 3. Enum "offline-app" permissions
while (enumerator.hasMoreElements()) {
  var perm = enumerator.getNext().QueryInterface(Components.interfaces.nsIPermission);
  if (perm.type == "offline-app" &&
      perm.capability != Components.interfaces.nsIPermissionManager.DEFAULT_ACTION &&
      perm.capability != Components.interfaces.nsIPermissionManager.DENY_ACTION) {
    appCaches.perms.push(perm);
  }     
}

// 4. Get app cache group with nsIApplicationCacheService
var cacheService = Cc["@mozilla.org/network/application-cache-service;1"].getService(Ci.nsIApplicationCacheService);
var groups = cacheService.getGroups();

// Pick out app cache of group for each permission and then get usage
appCaches.perms.forEach(p => {
  appCaches.usages[appCaches.usages.length] = 0;
  // XXX:
  // Here we match one permission against multiple groups. Why?
  // Consider this case:
  // There is one site, http://codebits.glennjones.net, which has 3 appcache manifest files:
  //   http://codebits.glennjones.net/appcache/network/manifest01.appcache#,
  //   http://codebits.glennjones.net/appcache/network/manifest02.appcache#,
  //   http://codebits.glennjones.net/appcache/network/manifest03.appcache#.
  // Then there will be 3 app cache gruops and one permission.
  // All the usages of those 3 groups should be accounted under one permission for http://codebits.glennjones.net
  for (let group of groups) {
    let uri = Services.io.newURI(group, null, null);
    if (perm.matchesURI(uri, true)) {
      let cache = cacheService.getActiveCache(group);
      // Could useDownloadUtils.convertByteUnits in DownloadUtils.jsm to convert usage into meaningful size info
      appCaches.usages[appCaches.usages.length] += cache.usage;
    }
  }
});
```

## Http cache disk usage
1. Using `CacheStorageService::AsyncGetDiskConsumption`
  - Underneath it uses `CacheIndex->mIndexStats.Size()`
  - Would get the most usage (including all overhead costs)

2. Using retunred `consumption` by `diskStorage.asyncVisitStorage` with `nsICacheStorageVisitor::onCacheStorageInfo`
  - Underneath it loops `CacheIndex->mFrecencyArray.Iter()` to get each file size
  - Would get the 2nd most usage (including less overhead costs)
  
3. Summing up retunred `dataSize` by `diskStorage.asyncVisitStorage` with `nsICacheStorageVisitor::onCacheEntryInfo`
  - Underneath it uses `CacheEntry::GetDataSize` to get file size or `CacheFileMetadata->Offset()` to get from file metadta
  - Would get the least usage (including the least overhead costs), around 80% of the 1st method
  

## Enum permissions
```javascript
// Get the nsIPermissionManager service (Could get from Services.perms in Services.jsm as well)
var permMgr = Cc["@mozilla.org/permissionmanager;1"].getService(Ci.nsIPermissionManager) 

// Get the permission enumerator
var e = permMgr.enumerator; // This is a getter fn not property

// Loop permissions
var p;
while (e.hasMoreElements()) {
  p = e.getNext();
  // For exmaple, test the geo permission.
  var res = Services.perms.testExactPermissionFromPrincipal(p.principal, "geo");
  switch (res) {
    case Ci.nsIPermissionManager.ALLOW_ACTION:
      // The case that user always allows
    break;
    
    case Ci.nsIPermissionManager.DENY_ACTION:
      // The case that user always denys
    break;
    
    case Ci.nsIPermissionManager.UNKNOWN_ACTION:
      // The case that the permission hasn't been prmopted to user
    break;
  }
}

```

## Add permission
```javascript

// 1. Create URI form origin
var uri = NetUtil.newURI("https://www.foo.com");

// 2. Create principal for origin [1]
var principal = Services.scriptSecurityManager.createCodebasePrincipal(uri, {});

// 3. Add from principal, say, for "geo" permission
Services.perms.addFromPrincipal(principal, "geo", Ci.nsIPermissionManager.ALLOW_ACTION);

// [1] https://dxr.mozilla.org/mozilla-central/source/caps/nsIScriptSecurityManager.idl#193
```


## How is permission removed
1. Remove by permission or uri or principal using `nsIPermissionManager` [1].

2. In nsPermissionManager.cpp [2], it all goes to `nsPermissionManager::RemoveFromPrincipal` actually.

3. In `RemoveFromPrincipal`, in fact it doesn't remove BUT change the permssion action to `nsIPermissionManager::UNKNOWN_ACTION` with the call to `nsPermissionManager::AddInternal`.

4. After the all internal operations are done, it will call `nsPermissionManager::NotifyObservers` to notify observers.

[1] https://dxr.mozilla.org/mozilla-central/source/netwerk/base/nsIPermissionManager.idl

[2] https://dxr.mozilla.org/mozilla-central/source/extensions/cookie/nsPermissionManager.cpp


## How is SUMO link dynamically generated
- The template URL is saved at firefox.js [1].
  ```
  pref("app.support.baseURL", "https://support.mozilla.org/1/firefox/%VERSION%/%OS%/%LOCALE%/");
  ```
  
- The URLFormatterService [2][3][4] can help to format the template URL
  ```javascript
  const SUMO_PAGE_ID = "prefs-main";
  var baseURL = Components.classes["@mozilla.org/toolkit/URLFormatterService;1"]
                          .getService(Components.interfaces.nsIURLFormatter)
                          .formatURLPref("app.support.baseURL");
  // For FF 51.02a on MAC OSX 10.10.4 with en-US lang,
  // url would be https://support.mozilla.org/1/firefox/51.0a2/Darwin/en-US/prefs-main
  var url = baseURL + SUMO_PAGE_ID;
  ```

[1] https://dxr.mozilla.org/mozilla-central/source/browser/app/profile/firefox.js
[2] https://dxr.mozilla.org/mozilla-central/source/toolkit/components/urlformatter/nsURLFormatter.manifest
[3] https://dxr.mozilla.org/mozilla-central/source/toolkit/components/urlformatter/nsIURLFormatter.idl
[4] https://dxr.mozilla.org/mozilla-central/source/toolkit/components/urlformatter/nsURLFormatter.js
