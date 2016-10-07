# FirefoxTech


## tabbrowser / browser / tabs / tab
* @browser/base/content/browser.xul

* ###Tabbrowser
 - Bindings: browser/base/content/tabbrowser.xml#tabbrowser
 - This element contains ```html <browser>```
 - this.selectedBrowser is <browser>
 - this.tabContainer is <tabs> but <tabs> is not under <tabbrowser> in the DOM tree
 - This element even manage tabs so, for example of adding a tab,  call this.addTab

* ###browser
 - Under <tabbrowser> in the DOM tree
 - Similar to <iframe> except that it holds a page history and contains additional methods to manipulate the currently displayed page.
 - Website is rendered inside ```<browser>```
 
* ###tabs
 - This element contains <tab> in the DOM tree
 ![tabs image](https://raw.githubusercontent.com/Fischer-L/FirefoxTech/master/img/tabs.png)
  
