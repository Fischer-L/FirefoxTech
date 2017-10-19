# FirefoxTech

## Build Commands
- Artifact build Moz config
```
# Enable debug version of the pre-build binary artifact
#export MOZ_DEBUG="1"

# My first mozilla config
# Automatically download and use compiled C++ components:
ac_add_options --enable-artifact-builds
# ac_add_options --enable-debug

# Write build artifacts to:
mk_add_options MOZ_OBJDIR=./objdir-frontend
```

- Launch with specific profile
  ```
  ./mach run -P <SPECIFIC_PROFILE_NAME>
  ```
  - Create a specific profile:
    
    1. Run `./mach run -P`
    
    2. A dialog window would prompt. Chose "Create Profile"
    
    3. Name your profile, ex DEV_PROFILE.
       Then would be able to run `./mach run -P DEV_PROFILE`
  
- Open Browser Toolbox without prompt
  
  Set devtools.debugger.prompt-connection to false


## Test
- Run
```
# For logging append one of three behind:
#   - 2>/dev/null | grep TMP
#   - 2>&1 | tee -a ./mochitest.log
#   - --log-tbpl=./mochitest.log-tbpl
./mach test [FILE_PATH] --log-tbpl-level=DEBUG
```

- Only push one specific directory for TRY to save time 
```
./mach try -b do -p linux,linux64,macosx64,win32,win64 -t none [DIR_PATH] # like toolkit/components/passwordmgr/test/browser
```

- Skip test
  - `add_task().skip()` makes sure that the task in question is not run as part of the suite. This will be made very clear in the log output as well.
  - `add_task().only()` makes sure that only the task in question is run, thus all the other tasks in that suite will be skipped. If `.only()` is called multiple times, it will run the last one on the stack.
  
  - See Bug 1380470 - Allow tasks to be skipped or only one task to run in all suites


## ESlint
- Under tools/lint
- tools/lint/eslint/update is the script excuting update task
- tools/lint/eslint.lint is the script run when excuting `./mach run FILE_PATH`
- taskcluster/ci/source-test/mozlint.yml is the lint task file for TaskCluster


## Debug
- Stop Firfox launch process to wait for the debugger connection
  1. Add "debugger;" to top of browser/base/content/browser.js
  2. $ ./mach run --jsdebugger --wait-for-jsdebugger
  3. Browser Toolbox opens, pausing Firefox startup at the added line

  This triggers Firefox to wait until the debugger connects, which makes it
possible to debug some Firefox startup JS code paths. By Bug 1275942 [1].

 [1] https://bugzilla.mozilla.org/show_bug.cgi?id=1275942


## Mozreview
- Git pushes specific range [1]

 `git mozreview push HEAD~2..HEAD` or `git mozreview push 7accd95..6834f7e`
 
 [1] http://mozilla-version-control-tools.readthedocs.io/en/latest/mozreview/commits.html#id1


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


## RR
- Example:
```
# Run FF with this cmd and make operations
$ ./mach run --debugger=rr

# List the processes recorded
$ rr ps

# Replay
$ rr replay -p <pid> 
```

- While replaying, can use GDB cmd to set break point

- http://rr-project.org


## Still want to install a legacy Boostrapped add-on?
- Set extensions.legacy.enabled to true
- Set xpinstall.signatures.required to false
- Open about:debugging then load temporary add-on

## Telemetry
### Set probe for executing time
```
TelemetryStopwatch.start(....);
// Codes being measured
TelemetryStopwatch.finish(....);
```
[1] The great bug from mconley: https://bugzilla.mozilla.org/show_bug.cgi?id=1340842


## e10s
### Limit of the number of content processes
- Types of content processes [1]: 
  - DEFAULT_REMOTE_TYPE = web
  - FILE_REMOTE_TYPE = file
  - EXTENSION_REMOTE_TYPE = extension
  - LARGE_ALLOCATION_REMOTE_TYPE = webLargeAllocation

  [1] http://searchfox.org/mozilla-central/source/dom/ipc/ContentParent.h#40

- Prefs of limit
  - Default: dom.ipc.processCount 
  - Per type: dom.ipc.processCount.[type]
  - Priority example: dom.ipc.processCount.web > dom.ipc.processCount 


## Access OS file system in JS
Import toolkit/components/osfile/osfile.jsm

```javascript
Components.utils.import("resource://gre/modules/osfile.jsm");
```

Then utility functions are accessible from `OS.File`


## Manipulate JS source codes in JS
- Using SpiderMonkey Reflection Parser API [1], then it can live parse and touch JS codes.

- The Reflection Parser API is under [2]

- Import example:
  ```javascript
  // Method 1:
  const init = Components.classes["@mozilla.org/jsreflect;1"].createInstance();
  init();
  
  // Method 2: 
  Components.utils.import("resource://gre/modules/reflect.jsm");
  ```

[1] https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API

[2] toolkit/components/reflect

[3] Example: https://github.com/Fischer-L/FirefoxTech/blob/master/florian_on_js_reflection.js


## IPLD Code Gen Overrall
* The `ipc/ipdl/Makefile.in` is the build start.

* All the utility modules, classes, functions... are put under `ipc/ipdl/ipdl`.

* The `ipc/ipdl/ipdl.py` will be invoked to do ipc code gen task.
  And in ipdl.py, the jobs being done are:

  - Process command line to load parameters
    ```python
    # process command line
    op = optparse.OptionParser(usage='ipdl.py [options] IPDLfiles...')
    ... ...
    op.add_option('-q', '--quiet', dest='verbosity', action='store_const', const=0,
              help="Suppress logging output")	
    ... ...
    options, files = op.parse_args()
    _verbosity = options.verbosity
    ... ...
    ```

  - Read ipdl files and do some checks
    ```python
    # First pass: parse and type-check all protocols
    for f in files:
      ... ...
      filename = normalizedFilename(f)
      ... ...
      ast = ipdl.parse(specstring, filename, includedirs=includedirs)
      ... ...
      if not ipdl.checkSyncMessage(ast, syncMsgList):
        print >>sys.stderr, 'Error: New sync IPC messages must be reviewed by an IPC peer and recorded in %s' % options.syncMsgList
        sys.exit(1)
    ```

  - Code gen
    ```python
    # Second pass: generate code
    for f in files:
      filename = normalizedFilename(f)
      ast = ipdl.parse(None, filename, includedirs=includedirs)
      ... ...
    ... ...
    print >>ipcmsgstart, """
    // CODE GENERATED by ipdl.py. Do not edit.

    #ifndef IPCMessageStart_h
    #define IPCMessageStart_h

    enum IPCMessageStart {
    """
    ... ...
    ```

[1] A good example from :kanru - Bug 1336961: https://bugzilla.mozilla.org/show_bug.cgi?id=1336919


## Get Chrome Window
```js
let WM = Cc['@mozilla.org/appshell/window-mediator;1'].getService(Ci.nsIWindowMediator);
let chromeWindow = WM.getMostRecentWindow("navigator:browser"); 
```
  
  
## FirefoxBrowser / tabbrowser / browser / tabs / tab
### FirefoxBrowser
`browser/base/content/browser.xul` is where FirefoxBrowser exists. So-called FirefoxBrowser is the most top-level, entire firefox browser UI. There is a `browser/base/content/hiddenWindow.xul` as well

### Tabbrowser
 - Bindings: browser/base/content/tabbrowser.xml#tabbrowser
 - This element contains `<browser>`
 - `this.selectedBrowser` is `<browser>`
 - `this.tabContainer` is `<tabs>` but `<tabs>` is not under `<tabbrowser>` in the DOM tree
 - This element even manage tabs so, for example of adding a tab, call `this.addTab`

### browser
 - Under `<tabbrowser>` in the DOM tree
 - Similar to `<iframe>` except that it holds a page history and contains additional methods to manipulate the currently displayed page.
 - Website is rendered inside `<browser>`
 - Bindings:
   - browser/base/content/tabbrowser.xml#[ tabbrowser-remote-browser | tabbrowser-browser ]
   - toolkit/content/widgets/browser.xml#browser
 
### tabs
 - This element contains `<tab>` in the DOM tree
 
 ![tabs image](https://raw.githubusercontent.com/Fischer-L/FirefoxTech/master/img/tabs.png)
  
### tab
 - A single tab 
 
  ![tab image](https://raw.githubusercontent.com/Fischer-L/FirefoxTech/master/img/tab.png)
 

## Switch selected tab
https://github.com/Fischer-L/FirefoxTech/blob/master/Switch_Selected_Tab.md


## Make the chrome popup always shown
- Set the popup's `noautohide` attribute to "true"

- In browser.js [1], it would handle the event and hide the popup if
  1. the active element didn't contains and wasn't contained by the pop, and
  
  2. the popup's `noautohide` attribute is "false"
  
     ```javascript
     let position = elem.compareDocumentPosition(this._identityPopup);
     if (!(position & (Node.DOCUMENT_POSITION_CONTAINS | Node.DOCUMENT_POSITION_CONTAINED_BY)) &&
         !this._identityPopup.hasAttribute("noautohide")) {
       // Hide the panel when focusing an element that is
       // neither an ancestor nor descendant unless the panel has
       // @noautohide (e.g. for a tour).
       this._identityPopup.hidePopup();
     }
     ```
     
[1] https://dxr.mozilla.org/mozilla-central/rev/7d92f47379da55adf4da6d0b16398f5c629cf949/browser/base/content/browser.js#7723
 
 
## Firefox Startup
### On the 1st window loaded
- After observing the browser-delayed-startup-finished event, then `_onFirstWindowLoaded` at [1] would be invoked.

- Inside `_onFirstWindowLoaded`, would do a bunch of initialization jobs such as:
  - Init PDF.js
    ```javascript
     PdfJs.init(true);
     ...
    ```
    
  - Init ProcessHangMonitor
    ```javascript
     ProcessHangMonitor.init();
    ```
    
  - Decide if going to show the reset prompt like "It looks like you haven't started Firefox in a while. Do you want to clean it up for a fresh, like-new experience? And by the way, welcome back!"
    ```javascript
     // Offer to reset a user's profile if it hasn't been used for 60 days.
     const OFFER_PROFILE_RESET_INTERVAL_MS = 60 * 24 * 60 * 60 * 1000;
     let lastUse = Services.appinfo.replacedLockTime;
     let disableResetPrompt = Services.prefs.getBoolPref("browser.disableResetPrompt", false);

     if (!disableResetPrompt && lastUse &&
        Date.now() - lastUse >= OFFER_PROFILE_RESET_INTERVAL_MS) {
       this._resetProfileNotification("unused");
     } else if (AppConstants.platform == "win" && !disableResetPrompt) {
      // Check if we were just re-installed and offer Firefox Reset
      let updateChannel;
      try {
        updateChannel = Cu.import("resource://gre/modules/UpdateUtils.jsm", {}).UpdateUtils.UpdateChannel;
      } catch (ex) {}
      if (updateChannel) {
        let uninstalledValue =
          WindowsRegistry.readRegKey(Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER,
                                     "Software\\Mozilla\\Firefox",
                                     `Uninstalled-${updateChannel}`);
        let removalSuccessful =
          WindowsRegistry.removeRegKey(Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER,
                                       "Software\\Mozilla\\Firefox",
                                       `Uninstalled-${updateChannel}`);
        if (removalSuccessful && uninstalledValue == "True") {
          this._resetProfileNotification("uninstall");
        }
      }
     }
    ```
  
  - Check for updates
    ```javascript
     this._checkForOldBuildUpdates();
    ```
  
 [1] browser/components/nsBrowserGlue.js
 
 
## Where does gBrowser come from
In browser.js [1]
```javascript
[
  // Where <tabbrowser id="content"> === document.getElementById("content")
  ["gBrowser",            "content"], ...
].forEach(function(elementGlobal) {
  var [name, id] = elementGlobal;
  window.__defineGetter__(name, function() {
    var element = document.getElementById(id);
    if (!element)
      return null;
    delete window[name];
    return window[name] = element;
  });
  window.__defineSetter__(name, function(val) {
    delete window[name];
    return window[name] = val;
  });
});
```
[1] https://dxr.mozilla.org/mozilla-central/source/browser/base/content/browser.js#203

 
## Where is the update history record stored
Look for active-update.xml, updates.xml, and updates folder under 

### In MAC
- Developer Edition update records dir: "/Users/USERNAME/Library/Caches/Mozilla/updates/Applications/FirefoxDeveloperEdition"
- Mach-built browser update files dir: /Users/USERNAME/Library/Caches/Mozilla/updates/Users/foxbrush/Projects/gecko/objdir-frontend/dist/Nightly

### In Linux
- Mach-built browser update records dir: /home/fischer/Projects/gecko/objdir-front-end/dist/bin
 

## Test Help Lib
- TestUtils [1]
- SpecialPowers [2][3]

[1] gecko/testing/modules/TestUtils.jsm

[2] gecko/testing/specialpowers/content/specialpowers.js

[3] gecko/testing/specialpowers/content/specialpowersAPI.js


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


## Moz UITour
- A library enabling the whitelisted webpages to interact with Firefox internal functions[1]

### Requirements
- The whilelist: browser/app/permissions
  - For testings, add test url into, like, browser.uitour.testingOrigins="https:www.foo.com,https://www.bar.com"

- The pref:
  - browser.uitour.enabled: true to enable
  - browser.uitour.requireSecure: false to allow http or only https and about


### Call flow
- In the webpage, include UITour-lib.js[2]
  - Call `Mozilla.UITour.openPreferences()` to open about:preferences
  - Mozilla.UITour would, then, dispatch a mozUITour event on document to talk to Firefox

- In the content-UITour.js[3]
  - Which is loaded at gBrowserInit.onLoad[5]
    ````javascript
      mm.loadFrameScript("chrome://browser/content/content-UITour.js", true);
    ```
  - Listens to the mozUITour event
    ```javascript
      addEventListener("mozUITour", UITourListener, false, true);
    ```
  - After checking the requesting page is trusted, then send an async message
    ```javascript
      sendAsyncMessage("UITour:onPageEvent", {
        detail: event.detail,
        type: event.type,
        pageVisibilityState: content.document.visibilityState,
      });
    ```
    
- In the nsBrowserGlue.js, would listen to the UITour:onPageEvent event, then call UITour[4] to handle the event
  ```javascript
    globalMM.addMessageListener("UITour:onPageEvent", function(aMessage) {
      UITour.onPageEvent(aMessage, aMessage.data);
    });
  ```

[1] http://bedrock.readthedocs.io/en/latest/uitour.html

[2] browser/components/uitour/UITour-lib.js

[3] browser/components/uitour/content-UITour.js

[4] browser/components/uitour/UITour.jsm

[5] browser/base/content/browser.js


## How to redirect about: page to a real page
- The mapping tables are at
  - browser/components/about/AboutRedirector.cpp
  - docshell/base/nsAboutRedirector.cpp
  
- The call flow:

  #### IS CYCLIC !!??

  - To get and return the channel of the about: page NS_NewChannelInternal at [8] would invoke nsIOService::NewChannelFromURIWithLoadInfo -> nsIOService::NewChannelFromURIWithProxyFlagsInternal

  - nsIOService::NewChannelFromURIWithProxyFlagsInternal at [7] would receive the uri to a about: page, and then
  
    - get the nsAboutProtocolHandler instance based on the uri scheme(about:), and then
      ```
       rv = GetProtocolHandler(scheme.get(), getter_AddRefs(handler));
      ```
      
    - Call nsAboutProtocolHandler::NewChannel2 to get the channel of the about: page
      ```
       rv = handler->NewChannel2(aURI, aLoadInfo, getter_AddRefs(channel));
      ```

  - nsAboutProtocolHandler::NewChannel2 at [1] would receive the uri to a about: page, and then
  
    - get the instance of nsIAboutModule[4], which is AboutRedirector[2] or nsAboutRedirector[3] based on uri, and then
      ```
       nsresult rv = NS_GetAboutModule(uri, getter_AddRefs(aboutMod));
      ```
      
      - mozilla::Module::ContractIDEntry kBrowserContracts at [5] and mozilla::Module::ContractIDEntry kDocShellContracts at [6] hold the mapping between about: page and the contract id of AboutRedirector / nsAboutRedirector
    
    - new a channel instance of that about: page to return to the caller
      ```
       rv = aboutMod->NewChannel(uri, aLoadInfo, result);
      ```
      
 - AboutRedirector/nsAboutRedirector::NewChannel would map real chrome url to uri and set the channel
  
 [1] netwerk/protocol/about/nsAboutProtocolHandler.cpp
  
 [2] browser/components/about/AboutRedirector.cpp
  
 [3] docshell/base/nsAboutRedirector.cpp
  
 [4] netwerk/protocol/about/nsIAboutModule.idl
  
 [5] browser/components/build/nsModule.cpp
  
 [6] docshell/build/nsDocShellModule.cpp
  
 [7] netwerk/base/nsIOService.cpp
  
 [8] netwerk/base/nsNetUtil.cpp


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



## How does permission request show
### The geo permission example
1. The web page calls `navigator.geolocation.getCurrentPosition`

2. It would call into gecko through `getCurrentPosition` at Geolocation.webidl[1]

   [1] dom/webidl/Geolocation.webidl

3. `Geolocation::GetCurrentPosition`[1] at gecko is invoked, then
   
   - new an `nsGeolocationRequest` object
   
   - register a prompt request by `RegisterRequestWithPrompt(request)`[2]

   [1] dom/geolocation/nsGeolocation.cpp
   [2] Geolocation::RegisterRequestWithPrompt
   
4. ` Geolocation::RegisterRequestWithPrompt` would dispatch a `RequestPromptEvent` event to the main thread

   ```cpp
     nsCOMPtr<nsIRunnable> ev  = new RequestPromptEvent(request, mOwner);
     NS_DispatchToMainThread(ev);
   ```

5. In `RequestPromptEvent::Run` then would call `nsContentPermissionUtils::AskPermission`

6. `nsContentPermissionUtils::AskPermission` would call 1nsIContentPermissionRequest::GetTypes` to get permission array for types.

  ```cpp
  nsresult rv = aRequest->GetTypes(getter_AddRefs(typeArray));
  ```

  - `nsGeolocationRequest::GetTypes` (implementation of `nsIContentPermissionRequest::GetTypes`) would call `nsContentPermissionUtils::CreatePermissionArray` to create permission array for types

  - Back to `nsContentPermissionUtils::AskPermission`, after preparation, would get the `nsIContentPermissionPrompt`[1] service, then request for a prompt
  
  ```cpp
    nsCOMPtr<nsIContentPermissionPrompt> prompt = do_GetService(NS_CONTENT_PERMISSION_PROMPT_CONTRACTID);
    if (prompt) {
      if (NS_FAILED(prompt->Prompt(aRequest))) {
        return NS_ERROR_FAILURE;
      }
    }
  ```
  
  [1] dom/interfaces/base/nsIContentPermissionPrompt.idl

7. In nsBrowserGlue.js,
 - `ContentPermissionPrompt.prompt` implementing `Ci.nsIContentPermissionPrompt.prompt` would be invoked to handle request.
 
 - In `ContentPermissionPrompt.prompt`, `ContentPermissionIntegration.createPermissionPrompt(type, request)` is called to create "geolocation" or "persistent-storage" or ... permission UI prompter.
   - In PermissionUI.jsm, many permission UI prompters are implemented, like PersistentStoragePermissionPrompt or GeolocationPermissionPrompt or ...
 
 - Once getting permission UI prompter, call `prompt` on permission UI prompter to prompt permission request
   ```javascript
     let permissionPrompt = combinedIntegration.createPermissionPrompt(type, request);
     permissionPrompt.prompt();
   ```
 
 - In `PermissionPromptPrototype.prompt` [1], `ChromeWindow.PopupNotifications.show` [2] is called to show popup notification for permission request
 
  [1] https://dxr.mozilla.org/mozilla-central/source/browser/modules/PermissionUI.jsm#258
  
  [2] https://dxr.mozilla.org/mozilla-central/source/toolkit/modules/PopupNotifications.jsm#422

6. In browser.xul
 - would include notification popup UI: panel#notification-popup
 
   ```
   #include popup-notifications.inc
   ```
  The file is at browser/base/content/popup-notifications.inc 
 - the XBL binding for panel#notification-popup is at toolkit/content/widgets/popup.xml#arrowpanel


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
function addPermission(type, origins) {
  if (origins instanceof Array === false) origins = [origins];
  
  let { NetUtil } = Cu.import("resource://gre/modules/NetUtil.jsm", {});
  origins.forEach(origin => {
    // 1. Create URI form origin
    let uri = NetUtil.newURI(origin);
    
    // 2. Create principal for origin
    //    https://dxr.mozilla.org/mozilla-central/source/caps/nsIScriptSecurityManager.idl#193
    let principal = Services.scriptSecurityManager.createCodebasePrincipal(uri, {});
    
    // 3. Add from principal
    Services.perms.addFromPrincipal(principal, type, Ci.nsIPermissionManager.ALLOW_ACTION);
  });
}
```


## Make a fake permission request
```javascript
function makePermissionRequest(origin, permType = "persistent-storage", xulBrowser = null) {
  // Make a principal from given origin
  let { NetUtil } = Cu.import("resource://gre/modules/NetUtil.jsm", {});
  let uri = NetUtil.newURI(origin);
  let principal = Services.scriptSecurityManager.createCodebasePrincipal(uri, {});
  
  // Make a permission type array
  let type = {
    type: permType,
    access: null,
    options: [],
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPermissionType]),
  };
  let typeArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  typeArray.appendElement(type, false);

  let request = {
    principal,
    types: typeArray,
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPermissionRequest]),
    allow: function() {
      console.log(`Allow ${permType} Permissoin`);
    },
    cancel: function() {
      console.log(`Block ${permType} Permissoin`);
    },
    element: xulBrowser || gBrowser.selectedBrowser,
    window: null,
  };
  return request;
}

function sendPermissionRequest(request, chromeWindow = null) {
  // Using askPermission from nsIDOMWindowUtils that takes care of the remoting if needed.
  let window = chromeWindow || gBrowser.ownerGlobal;
  let windowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
  windowUtils.askPermission(request);
}
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


## Add l10n support
- The reference bug by :gasolin

  Bug 1369291 - add l10n support for onboarding overlay;r=mossop,rexboy,pike


## Never Hard Code Brand Name
1. Insert the brand name strings asset:

 ```
   <stringbundle id="bundle_brand" src="chrome://branding/locale/brand.properties"/>
 ```
 
2. In your string asset, for example

 ```
   # LOCALIZATION NOTE (hello): %S = brandShortName
   hello=Hello %s
 ```

3. Format the string

 ```
   let brandShortName = document.getElementById("bundle_brand").getString("brandShortName");
   let myStringBundle = document.getElementById("myStringBundle");
   let text = myStringBundle.getFormattedString("hello", [brandShortName]); // text = "Hello Nightly" on Nightly
 ```


## Customize Mode
- XUL: customizeMode.inc.xul
- JS: CustomizeMode.jsm, CustomizableUI.jsm
  - `CustomizeMode.toggle` would open/close the Customize mode
- The customization state
  - `CustomizableUI.setState` would serialed and saved state in the browser.uiCustomization.state char pref
- Not loaded in `<browser>` but directly in browser.xul, which right below the hbox#browser.
  ```xml
    <tabs id="tabbrowser-tabs">
      /* The unique tab for the Customize mode */
      <tab class="tabbrowser-tab" customizemode="true">
    </tabs>
    
    <deck id="content-deck" flex="1">
      <hbox id="browser">
        /* Inside holds <tabbrowser> and <browser>s */
      </hbox>
      <hbox id="customization-container">
        /* Inside hold the Customize mode UI */
      </hbox>
    </deck>
  ```

## The flow of loading appcache from html element's manifest attribute
https://github.com/Fischer-L/FirefoxTech/blob/master/Loading_Appcache_Manifest.md

## Profile Refresh
- Services.appinfo.replacedLockTime

- nsresult nsProfileLock::GetReplacedLockTime(PRTime *aResult)

https://dxr.mozilla.org/mozilla-central/rev/0b255199db9d6a6f189b89b7906f99155bde3726/toolkit/profile/nsProfileLock.cpp#443

- nsXULAppInfo::GetReplacedLockTime(PRTime *aReplacedLockTime)

https://dxr.mozilla.org/mozilla-central/rev/0b255199db9d6a6f189b89b7906f99155bde3726/toolkit/xre/nsAppRunner.cpp#1021

- nsLocalFile::SetLastModifiedTime(PRTime aLastModTime)

https://dxr.mozilla.org/mozilla-central/rev/81977c96c6ff49e4b70f88a55f38d47f5e54a08b/xpcom/io/nsLocalFileUnix.cpp#1104

- nsJAR::Extract(const nsACString &aEntryName, nsIFile* outFile)

https://dxr.mozilla.org/mozilla-central/rev/0b255199db9d6a6f189b89b7906f99155bde3726/modules/libjar/nsJAR.cpp#233

- toolkit/components/startup/nsAppStartup.cpp

- Profile service
  ```javascript
    Components.classes["@mozilla.org/toolkit/profile-service;1"].getService(Components.interfaces.nsIToolkitProfileService)
  ```


## Directory Service
```javacsript
// "ProfD" = Profile dir
// "UAppData" = User app data dir
// "CurWorkD" = Current working dir
var propKeyWord = "ProfD";
var file = Services.dirsvc.get(propKeyWord, Ci.nsILocalFile); // Ci.nsIFile is fine as well
```


## Migrate Bookmarks/History from Other Browsers
- The prefs for auto-migration: browser.migrate.automigrate.*

- The great bugs by Gijs:
  - https://bugzilla.mozilla.org/show_bug.cgi?id=1344282#c29
  - https://bugzilla.mozilla.org/show_bug.cgi?id=1344759


## Firefox Entry Point
- int main(int argc, char* argv[], char* envp[]) 
  - @ browser/app/nsBrowserApp.cpp
  - The application is main entry potin where all start from here.

- XREMain::XRE_main(int argc, char* argv[], const BootstrapConfig& aConfig)
  - @ toolkit/xre/nsAppRunner.cpp
  - A class based main entry point used by most platforms.
  

- Select Profile
  - @ XREMain::XRE_mainStartup
  - Initializes the profile and various other services. Called before `XREMain::XRE_mainRun`
    ```cpp
      // This would new the nsToolkitProfileService instance and duing the init of nsToolkitProfileService,
      // the profiles.ini would be parsed to determine the default profile.
      rv = NS_NewToolkitProfileService(getter_AddRefs(mProfileSvc));
      
      // ......
      
      // In call of `SelectProfile`, we would lock profile
      rv = SelectProfile(getter_AddRefs(mProfileLock), mProfileSvc, mNativeApp, &mStartOffline, &mProfileName);
    ```

- The "app-startup" event
  - @ XREMain::XRE_mainRun
    ```cpp
      startupNotifier->Observe(nullptr, APPSTARTUP_TOPIC, nullptr);
    ```
    
  - The event would brocast to let neccesasry components know Firefox is starting up.
  
  - nsBrowserGlue.js is registered for this event and would be loaded in this event
    - @ browser/components/BrowserComponents.manifest
      ```
        # This line says, on app-startup, load the nsBrowserGlue service of the contract id is @mozilla.org/browser/browserglue;1 for applications following
        # application={ID_OF_DESKTOP_OR_FENNEC_OR_SOME_OTHER_BUILD_OF_FIREFOX}
        category app-startup nsBrowserGlue service,@mozilla.org/browser/browserglue;1 application={3c2e2abc-06d4-11e1-ac3b-374f68613e61} application={ec8030f7-c20a-464f-9b0e-13a3a9e97384} application={aa3c5121-dab2-40e2-81ca-7ea25febc110} application={a23983c0-fd0e-11dc-95ff-0800200c9a66} application={d1bfe7d9-c01e-4237-998b-7b5f960a4314}
      ```
    
 - More details from Evelyn: https://www.evernote.com/shard/s97/sh/01f15d7f-b932-4fa5-b117-d67a7f8ceedb/4641809a0a79ee70
 
 - Test checking what gets loaded during startup:
   - An XPCOM module catching what gets loaded during startup:
   
     http://searchfox.org/mozilla-central/rev/2bcd258281da848311769281daf735601685de2d/browser/components/tests/startupRecorder.js
   
   - The test checking whitelisted and blacklisted scripts during startup
     
     https://dxr.mozilla.org/mozilla-central/source/browser/base/content/test/performance/browser_startup.js
 
    
## Reset Profile
https://github.com/Fischer-L/FirefoxTech/blob/master/Profile_Reset.md

 
## Profile Migration
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

- The migration works are implemented in JS
  - IDL: nsIProfileMigrator.idl
  - Implementation: ProfileMigrator.js
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
    
    
## Firefox Refresh to about:welcomback page
https://github.com/Fischer-L/FirefoxTech/blob/master/Firefox_Refresh_to_aboutWelcomback.md


## Where Firefox decides the 1st-run pages
- nsBrowserContentHandler.js
- See https://bugzilla.mozilla.org/show_bug.cgi?id=1381982 


## idleDispatch/idleDispatchToMainThread from JS
- Bug 1353206 - expose requestIdleCallback (or similar) API to non-DOM JS execution contexts
- Bug 1368072 - Expose IdleDispatch with timeout to JS
- Usage Example: Bug 1357154 - If about:preferences is open on Windows, it will poll the OS to see if the default browser has changed every second


## Call an nsIQuotaManagerService API
https://github.com/Fischer-L/FirefoxTech/blob/master/Call_To_nsIQuotaManagerService_API.md


## Firefox Data Stores
Firefox uses what types of storage technology to store data: 

https://github.com/mozilla/firefox-data-store-docs


## Devtool Actor
https://bugzilla.mozilla.org/show_bug.cgi?id=1401343



