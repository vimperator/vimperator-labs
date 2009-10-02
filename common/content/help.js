// Copyright (c) 2009 by Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.


const win = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
                      .getService(Ci.nsIWindowWatcher)
                      .activeWindow;
const liberator = win.liberator;

let page = liberator.findHelp(decodeURIComponent(document.location.search.substr(1)));
let url = page ? "chrome://liberator/locale/" + page : content.history.previous;

win.getBrowser().loadURIWithFlags(url, Components.interfaces.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY, null, null, null);

// vim: set fdm=marker sw=4 ts=4 et:
