- Assign selected tab to `<tabbrowser>`
  ```javascript
  // gBrowser is `<tabbrowser>`
  gBrowser.selectedTab = tab
  ```

- `selectedTab` of `<tabbrowser>` @tabbrowser.xml#tabbrowser
  - Forward seclect tab to `<tabbox>`
    ```javascript
    // mTabBox is `<tabbox>`, see [1]
    this.mTabBox.selectedTab = val;
    ```
    - [1] http://searchfox.org/mozilla-central/rev/f6dc0e40b51a37c34e1683865395e72e7fca592c/browser/base/content/tabbrowser.xml#74
  
- `selectedTab` of `<tabbox>` @tabbox.xml#tabbox
  - Forward selected tab to selected item of `<tabs>`
    ```javascript
    // tabs is `<tabs>` [1]
    // The binding inheritance of `selectedItem`: tabbrowser.xml#tabbrowser-tabs > tabbox.xml#tab [2]
    tabs.selectedItem = val;
    ```
    - [1] http://searchfox.org/mozilla-central/rev/f6dc0e40b51a37c34e1683865395e72e7fca592c/toolkit/content/widgets/tabbox.xml#58
    - [2] http://searchfox.org/mozilla-central/rev/f6dc0e40b51a37c34e1683865395e72e7fca592c/toolkit/content/widgets/tabbox.xml#113
 
- `selectedItem` of `<tabs>`
  - http://searchfox.org/mozilla-central/rev/f6dc0e40b51a37c34e1683865395e72e7fca592c/toolkit/content/widgets/tabbox.xml#443
    ```javascript
    this.selectedIndex = this.getIndexOfItem(val);
    ```

- `selectedIndex` of `<tabs>`
  - Update tabs' selected states
    - http://searchfox.org/mozilla-central/rev/f6dc0e40b51a37c34e1683865395e72e7fca592c/toolkit/content/widgets/tabbox.xml#397

  - Update selected panel
    - http://searchfox.org/mozilla-central/rev/f6dc0e40b51a37c34e1683865395e72e7fca592c/toolkit/content/widgets/tabbox.xml#411
      ```javascript
      // linkedPanel is `<notificationbox>`(holding browser) under `<tabpanels>` under `<tabbox>` under `<tabbrowser>`
      let linkedPanel = this.getRelatedElement(tab);
      if (linkedPanel) {
        this.tabbox.setAttribute("selectedIndex", val);
        
        // tabpanels is `<tabpanels>`
        // This will cause an onselect event to fire for the tabpanel element.
        this.tabbox.tabpanels.selectedPanel = linkedPanel;
      }
      ```
    
- `selectedPanel` of `<tabpanels>` @tabbrowser.xml#tabbrowser-tabpanels > tabbox.xml#tabpanels
  - Find the index of selected panel in the DOM(`<tabpanels>`)
    ```javascript
    var selectedIndex = -1;
    for (var panel = val; panel != null; panel = panel.previousSibling)
      ++selectedIndex;
    this.selectedIndex = selectedIndex;
    return val;
    ```
  
- `selectedIndex` of `<tabpanels>` @tabbrowser.xml#tabbrowser-tabpanels
  - Request the tab switcher to switch tab
    ```javascript
    // ... ...
    gBrowser._getSwitcher().requestTab(toTab);
    // ... ...
    ```

- `requestTab` of the tab switcher(`_getSwitcher`) @tabbrowser.xml#tabbrowser
  - Warm the tab (disabled by Bug 1394455)
  
  - Suppress displayport of the requested tab and queue unload job
    ```javascript
    this.requestedTab = tab;
    this.suppressDisplayPortAndQueueUnload(this.requestedTab, this.UNLOAD_DELAY);
    ```  
   
- `suppressDisplayPortAndQueueUnload` of the tab switcher
  - We don't want to paint the requested tab temporarily during siwtching tab
    ```javascript
    // tab is the requested tab
    let browser = tab.linkedBrowser;
    let fl = browser.frameLoader;
    if (fl && fl.tabParent && !this.activeSuppressDisplayport.has(fl.tabParent)) {
      // `suppressDisplayport` is nsITabParent::suppressDisplayport
      fl.tabParent.suppressDisplayport(true);
      this.activeSuppressDisplayport.add(fl.tabParent);
    }
    ```
  
  - Queue to unload unused tabs
    ```javascript
    // This won't run immediately so loading the requested tab should go first
    this.unloadTimer = this.setTimer(() => this.onUnloadTimeout(), unloadTimeout);
    ```
    
- `postAction` of the tab switcher
  - Load the requested tab if required
    ```javascript
    // If we're not loading anything, try loading the requested tab.
    let requestedState = this.getTabState(this.requestedTab);
    if (!this.loadTimer && !this.minimizedOrFullyOccluded &&
        (requestedState == this.STATE_UNLOADED ||
         requestedState == this.STATE_UNLOADING)) {
      this.loadRequestedTab();
    }
    ```
    
    - `loadRequestedTab` of the tab switcher
      ```js
      // Queue the `onLoadTimeout`
      this.loadTimer = this.setTimer(() => this.onLoadTimeout(), this.TAB_SWITCH_TIMEOUT);
      // Set the requested tab to the loading state
      this.setTabState(this.requestedTab, this.STATE_LOADING);
      ```
    
      - `setTabState` of the tab switcher
        - Activate the requested tab's docShell. See more details at the docShellIsActive section.
          ```js
          let browser = tab.linkedBrowser;
          let {tabParent} = browser.frameLoader;
          if (state == this.STATE_LOADING) {
            this.assert(!this.minimizedOrFullyOccluded);
            browser.docShellIsActive = true;
            if (!tabParent) {
              // ASSUMPTION:
              // Why sync call `onLayersReady` here?
              // `tabParent` is one nsIFrameLoader::tabParent,
              // which is null for non-remote frame [1].
              // At `postAction` [2], it says for a non-remote tab, 
              // sending layers to the compositor is sync operation.
              // So activating a non-remote browser's docShell should be sync,
              // we should fire layers ready sync here as well.
              this.onLayersReady(browser);
            }
          } else if (state == this.STATE_UNLOADING) {
            this.unwarmTab(tab);
            browser.docShellIsActive = false;
            if (!tabParent) {
              this.onLayersCleared(browser);
            }
          }
          ```

          [1] http://searchfox.org/mozilla-central/rev/298033405057ca7aa5099153797467eceeaa08b5/dom/base/nsIFrameLoader.idl#35

          [2] http://searchfox.org/mozilla-central/rev/298033405057ca7aa5099153797467eceeaa08b5/browser/base/content/tabbrowser.xml#4684
    
- `unloadNonRequiredTabs` of the tab switcher
  - continue from the queued `onUnloadTimeout` call
  - 
  

### Section: docShellIsActive
