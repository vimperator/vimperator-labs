// Copyright (c) 2009 by Doug Kearns
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

const Name = "Xulmus";
/*
 * We can't load our modules here, so the following code is sadly
 * duplicated: .w !sh
vimdiff ../../*'/components/about-handler.js'
 */
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;

const name = Name.toLowerCase();
function AboutHandler() {}
AboutHandler.prototype = {

    classDescription: "About " + Name + " Page",

    classID: Components.ID("81495d80-89ee-4c36-a88d-ea7c4e5ac63f"),

    contractID: "@mozilla.org/network/protocol/about;1?what=" + name,

    QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),

    newChannel: function (uri) {
        let channel = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService)
                          .newChannel("chrome://" + name + "/content/about.html", null, null);
        channel.originalURI = uri;
        return channel;
    },

    getURIFlags: function (uri) Ci.nsIAboutModule.ALLOW_SCRIPT
};

if(XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([AboutHandler]);
else
    function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule([AboutHandler]);

// vim: set fdm=marker sw=4 ts=4 et:
