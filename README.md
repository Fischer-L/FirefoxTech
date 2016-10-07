# FirefoxTech


## tabbrowser / browser / tabs / tab
* @browser/base/content/browser.xul

* ###Tabbrowser
 - Bindings: browser/base/content/tabbrowser.xml#tabbrowser
 - This element contains <browser>
 - this.selectedBrowser is <browser>
 - this.tabContainer is <tabs> but <tabs> is not under <tabbrowser> in the DOM tree
 - This element even manage tabs so, for example of adding a tab,  call this.addTab
