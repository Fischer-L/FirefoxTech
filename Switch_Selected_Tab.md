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
    ```js
    var alreadySelected = tab.selected;
    Array.forEach(this.childNodes, function(aTab) {
      if (aTab.selected && aTab != tab)
        aTab._selected = false;
    });
    tab._selected = true;
    ```

  - Update selected panel
    ```js
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
    
  - P2: Important! Fire the select event so that the tab switcher later could know time to adjust tab focus
    ```js
    // ... ...
    this._selectedPanel = newPanel;
    if (this._selectedPanel != panel) {
      var event = document.createEvent("Events");
      event.initEvent("select", true, true);
      this.dispatchEvent(event);
      this._selectedIndex = val;
    }
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
  
  - P1: Queue to unload unused tabs. See Section: onUnloadTimeout
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
              // `tabParent` is one nsIFrameLoader::tabParent, which is null for non-remote frame [1].
              // At `postAction` [2], it says for a non-remote tab, sending layers to the compositor is sync operation.
              // So activating an non-remote browser docShell should be sync, we should hanlde onLayersReady here right way.
              // The remote case is async. We will wait for "MozLayerTreeReady"[3] event to do handling.
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
          
          [3] http://searchfox.org/mozilla-central/rev/a4702203522745baff21e519035b6c946b7d710d/browser/base/content/tabbrowser.xml#5069
    
  - Decide which tab to display, such as a blank tab, spinner tab, or requested tab, then switch to it
    ```js
    this.updateDisplay();
    ```
    
    - `updateDisplay` of the tab switcher
      - Switch to the requested tab visible. This makes other tabs' frames not being rendered. 
        If wanted to render multiple tabs' frames at the same time, would need `display: -moz-stack`.
        See Section: -moz-deck and -moz-stack.
        ```js
        // If the display of `<tabpanels>` is `-moz-deck`(by default),
        // updating the "selectedIndex" attirbute would switch to and make the requested tab visible
        tabPanel.setAttribute("selectedIndex", index);
        ```
    
  - Maybe finish
    ```js
    // ... ...
    
    // Unload the redundant warming tabs
    if (numWarming > this.tabbrowser.tabWarmingMax) {
      this.logState("Hit tabWarmingMax");
      if (this.unloadTimer) {
        this.clearTimer(this.unloadTimer);
      }
      this.unloadNonRequiredTabs();
    }
    
    // There still might be some not-yet-unloaded out there.
    // The `onUnloadTimeout1 scheduled in the P1 position would help us to unload them, then finish.
    if (numPending == 0) {
      this.finish();
    }
    ```
    
### Section: onUnloadTimeout
- `onUnloadTimeout` of the tab switcher

- `unloadNonRequiredTabs` of the tab switcher
  
  If there are any non-visible and non-requested tabs in STATE_LOADED, sets them to STATE_UNLOADING. 
  
  Also queues up the unloadTimer to run onUnloadTimeout if there are still tabs in the process of unloading.
  
- `postActions` of the tab switcher
   
   This call would finish the tab switch if no more pending unloaded tabs out there
  

### Section: docShellIsActive
- IDL: nsITabParent::docShellIsActive

- Implementation: 
  - Getter: TabParent::GetDocShellIsActive
  - Setter: TabParent::SetDocShellIsActive
  
- In JS, call one `<browser>`'s `docShellIsActive`
  ```js
  // This would have the browser visible and being painted.
  gBrowser.selectedBrowser.docShellIsActive = true;
  ```

- TabParent::SetDocShellIsActive would receive the call from JS
  - Send `Browser::Msg_SetDocShellIsActive__ID` msg to TabChild
    ```cpp
    // `mPreserveLayers` defaults to false and if false and deactiving, then tab would be hidden in the end.
    // `mLayerTreeEpoch` is used to rule out the old request.
    Unused << SendSetDocShellIsActive(isActive, mPreserveLayers, mLayerTreeEpoch);
    ```

- TabChild::RecvSetDocShellIsActive
  - Receive the ipc call from TabParent
    ```cpp
    // Since requests to change the active docshell come in from both the hang
    // monitor channel and the PContent channel, we have an ordering problem. This
    // code ensures that we respect the order in which the requests were made and
    // ignore stale requests.
    if (mLayerObserverEpoch >= aLayerObserverEpoch) {
      return IPC_OK();
    }
    mLayerObserverEpoch = aLayerObserverEpoch;

    // ... ...
    ```
  
- TabChild::InternalSetDocShellIsActive
  ```cpp
  // ... ...
  
  nsCOMPtr<nsIDocShell> docShell = do_GetInterface(WebNavigation());
  
  // ... ...
  
  if (aIsActive) {
    MakeVisible(); // Make tab visible

    if (!docShell) {
      return;
    }

    // We don't use TabChildBase::GetPresShell() here because that would create
    // a content viewer if one doesn't exist yet. Creating a content viewer can
    // cause JS to run, which we want to avoid. nsIDocShell::GetPresShell
    // returns null if no content viewer exists yet.
    if (nsCOMPtr<nsIPresShell> presShell = docShell->GetPresShell()) {
      if (nsIFrame* root = presShell->FrameConstructor()->GetRootFrame()) {
        FrameLayerBuilder::InvalidateAllLayersForFrame(
          nsLayoutUtils::GetDisplayRootFrame(root));
        root->SchedulePaint();
      }

      Telemetry::AutoTimer<Telemetry::TABCHILD_PAINT_TIME> timer;
      // If we need to repaint, let's do that right away. No sense waiting until
      // we get back to the event loop again. We suppress the display port so that
      // we only paint what's visible. This ensures that the tab we're switching
      // to paints as quickly as possible.
      APZCCallbackHelper::SuppressDisplayport(true, presShell);
      if (nsContentUtils::IsSafeToRunScript()) {
        WebWidget()->PaintNowIfNeeded();
      } else {
        RefPtr<nsViewManager> vm = presShell->GetViewManager();
        if (nsView* view = vm->GetRootView()) {
          presShell->Paint(view, view->GetBounds(), nsIPresShell::PAINT_LAYERS);
        }
      }
      APZCCallbackHelper::SuppressDisplayport(false, presShell);
    }
  } else if (!aPreserveLayers) {
    MakeHidden();
  }
  ```

- TabParent::SetDocShellIsActive
  - Force painting after sending `Browser::Msg_SetDocShellIsActive__ID` ipc msg
    ```cpp 
    // Ask the child to repaint using the PHangMonitor channel/thread (which may
    // be less congested).
    if (isActive) {
      ContentParent* cp = Manager()->AsContentParent();
      cp->ForceTabPaint(this, mLayerTreeEpoch);
    }
    ```

### Section: -moz-deck and -moz-stack
- Both are XUL display type. `display: -moz-deck` or `display: -moz-stack`.
  [1] http://searchfox.org/mozilla-central/rev/7ba03cebf1dcf3b4c40c85a4efad42a5022cf1ec/layout/style/nsStyleConsts.h#423
  [2] http://searchfox.org/mozilla-central/rev/8efd128b48cdae3a6c6862795ce618aa1ca1c0b4/layout/base/nsCSSFrameConstructor.cpp#4419

#### -moz-deck
- The representing frame class is `nsDeckFrame` @ nsDeckFrame.cpp

- Only could draw one frame at one time

- While xul element's "selectedIndex" changed, it would observer and then update the displayed frame
  - nsDeckFrame::AttributeChanged
    ```cpp
     // if the index changed hide the old element and make the new element visible
    if (aAttribute == nsGkAtoms::selectedIndex) {
      IndexChanged();
    }
    ```

  - nsDeckFrame::IndexChanged
    ```cpp
    //did the index change?
    int32_t index = GetSelectedIndex();
    if (index == mIndex)
      return;

    // redraw
    InvalidateFrame();
    
    // ... ...
    ```
    
  - nsDeckFrame::GetSelectedIndex
    ```cpp
    // get the index attribute
    nsAutoString value;
    if (mContent->GetAttr(kNameSpaceID_None, nsGkAtoms::selectedIndex, value))
    {
      nsresult error;
      // convert it to an integer
      index = value.ToInteger(&error);
    }
    ```

#### -moz-stack
- The representing frame class is `nsStackFrame` @ nsStackFrame.cpp

- Basically frames are on top of each other one by one and could draw multiple frames at the same time.

- To render 2 or more tab's frames at the same time, we need
  - Set 2 tab's browsers' docShell as active
  
  - Reveal the below tab from the top tab, for example
    ```xml
    <!--  The total width is 1000px -->
    <tabpanels style="display: -moz-stack">
      <!-- 500px right margin makes this panel take 500px left side -->
      <notificationbox id="panel-1" style="margin-right: 500px">
        <!--  This broswer's docShell has to be active -->
        <browser id="browser-1" ></browser>
      </notificationbox>
      <!-- 500px left margin makes this panel take 500px right side
           so that could reveal the #panel-1 beath it on the half left side. -->
      <notificationbox id="panel-2" style="margin-left: 500px">
        <!--  This broswer's docShell has to be active -->
        <browser id="browser-2></browser>
      </notificationbox>
    </tabpanels>
    ```
    
    



