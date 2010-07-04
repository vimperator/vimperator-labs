// Header:
const Name = "Muttator";
/*
 * We can't load our modules here, so the following code is sadly
 * duplicated: .w !sh
vimdiff ../../*'/components/commandline-handler.js'
 */

// Copyright (c) 2009 by Doug Kearns
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const name = Name.toLowerCase();
function CommandLineHandler() {
    this.wrappedJSObject = this;
}
CommandLineHandler.prototype = {

    classDescription: Name + " Command-line Handler",

    classID: Components.ID("{16dc34f7-6d22-4aa4-a67f-2921fb5dcb69}"),

    contractID: "@mozilla.org/commandlinehandler/general-startup;1?type=" + name,

    _xpcom_categories: [{
        category: "command-line-handler",
        entry: "m-" + name
    }],

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsICommandLineHandler]),

    handle: function (commandLine) {
        // TODO: handle remote launches differently?
        try {
            this.optionValue = commandLine.handleFlagWithParam(name, false);
        }
        catch (e) {
            dump(name + ": option '-" + name + "' requires an argument\n");
        }
    }
};

if(XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([CommandLineHandler]);
else
    function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule([CommandLineHandler]);

// vim: set ft=javascript fdm=marker sw=4 ts=4 et:
