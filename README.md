# FirefoxTech


## tabbrowser / browser / tabs / tab
* @browser/base/content/browser.xul

* ###Tabbrowser
 - Bindings: browser/base/content/tabbrowser.xml#tabbrowser
 - This element contains ```<browser>```
 - this.selectedBrowser is ```<browser>```
 - this.tabContainer is ```<tabs>``` but ```<tabs>``` is not under ```<tabbrowser>``` in the DOM tree
 - This element even manage tabs so, for example of adding a tab,  call this.addTab

* ###browser
 - Under ```<tabbrowser>``` in the DOM tree
 - Similar to ```<iframe>``` except that it holds a page history and contains additional methods to manipulate the currently displayed page.
 - Website is rendered inside ```<browser>```
 
* ###tabs
 - This element contains ```<tab>``` in the DOM tree
 
 ![tabs image](https://raw.githubusercontent.com/Fischer-L/FirefoxTech/master/img/tabs.png)
  
* ###tab
 - A single tab 
 
  ![tab image](https://raw.githubusercontent.com/Fischer-L/FirefoxTech/master/img/tab.png)



##Where is the update history record stored
Look for active-update.xml, updates.xml, and updates folder under 

###In MAC
- Developer Edition update records dir: "/Users/USERNAME/Library/Caches/Mozilla/updates/Applications/FirefoxDeveloperEdition"
- Mach-built browser update files dir: /Users/USERNAME/Library/Caches/Mozilla/updates/Users/foxbrush/Projects/gecko/objdir-frontend/dist/Nightly

###In Linux
- Mach-built browser update records dir: /home/fischer/Projects/gecko/objdir-front-end/dist/bin



##How to inject a mock JS XPCOM component
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
