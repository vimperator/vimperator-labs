// Header:
const Name = "Xulmus";
// The following doesn't work here, so this module's code is sadly duplicated:
//     Components.utils.import("resource://liberator/commandline-handler.jsm");

// Copyright (c) 2009 by Doug Kearns
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const name = Name.toLowerCase();
function CommandLineHandler()
{
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

    handle: function (commandLine)
    {
        // TODO: handle remote launches differently?
        try
        {
            this.optionValue = commandLine.handleFlagWithParam(name, false);
        }
        catch (e)
        {
            //"vimperator: option -vimperator requires an argument"
        }
    }
};

function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule([CommandLineHandler]);

// vim: set ft=javascript fdm=marker sw=4 ts=4 et:
