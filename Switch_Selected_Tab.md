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
