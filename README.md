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
 - this.selectedBrowser is `<browser>`
 - this.tabContainer is `<tabs>` but `<tabs>` is not under `<tabbrowser>` in the DOM tree
 - This element even manage tabs so, for example of adding a tab,  call this.addTab

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

2. Call
 - promptSvc.confirm for simple OK/Cancel prompt
 - promptSvc.confirmEx for different button labels prompt (by using flags param)
 - etc…

3. The nsIPromptService is defined at
 - toolkit/components/prompts/src/nsPrompter.js
 - embedding/components/windowwatcher/nsIPromptService.idl
 - embedding/components/windowwatcher/nsIPromptService2.idl


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
- gecko/objdir-front-end/tmp/scratch_user/cache2/entries


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

