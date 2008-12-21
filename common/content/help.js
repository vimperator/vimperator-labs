
const liberator = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
			    .getService(Components.interfaces.nsIWindowWatcher)
			    .activeWindow
			    .liberator;

liberator.help(decodeURIComponent(document.location.search.substr(1)));

