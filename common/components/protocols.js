// Copyright (c) 2008-2009 Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/* Adds support for data: URIs with chrome privileges
 * and fragment identifiers.
 *
 * "chrome-data:" <content-type> [; <flag>]* "," [<data>]
 *
 * By Kris Maglione, ideas from Ed Anuff's nsChromeExtensionHandler.
 */

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyGetter(this, "convert", function () {
    var obj = new Object;
    Cu.import("resource://liberator/template.js", obj);
    return obj.convert;
});

const NS_BINDING_ABORTED = 0x804b0002;
const nsIProtocolHandler = Ci.nsIProtocolHandler;

const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

let channel = Components.classesByID["{61ba33c0-3031-11d3-8cd0-0060b0fc14a3}"]
                        .getService(Ci.nsIProtocolHandler)
                        .newChannel(ioService.newURI("chrome://liberator/content/data", null, null))
                        .QueryInterface(Ci.nsIRequest);
const systemPrincipal = channel.owner;
channel.cancel(NS_BINDING_ABORTED);
delete channel;

function dataURL(type, data) "data:" + (type || "application/xml;encoding=UTF-8") + "," + encodeURIComponent(data);
function makeChannel(url, orig) {
    if (typeof url == "function")
        url = dataURL.apply(null, url());
    let uri = ioService.newURI(url, null, null);
    let channel = ioService.newChannelFromURI(uri);
    channel.owner = systemPrincipal;
    channel.originalURI = orig;
    return channel;
}
function fakeChannel(orig) makeChannel("chrome://liberator/content/does/not/exist", orig);
function redirect(to, orig) {
    //xxx: escape
    let html = '<html><head><meta http-equiv="Refresh" content="' + ("0;" + to).replace(/"/g, "&quot;") + '"/></head></html>';
    return makeChannel(dataURL('text/html', html), ioService.newURI(to, null, null));
}
XPCOMUtils.defineLazyGetter(this, "cache", function () {
    var dir = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
    dir.append("liberatorCache");
    if (!dir.exists()) {
        dir.create(dir.DIRECTORY_TYPE, -1);
    }
    return dir;
});
XPCOMUtils.defineLazyGetter(this, "version", function () {
    return Services.appinfo.version;
});

function ChromeData() {}
ChromeData.prototype = {
    contractID:       "@mozilla.org/network/protocol;1?name=chrome-data",
    classID:          Components.ID("{c1b67a07-18f7-4e13-b361-2edcc35a5a0d}"),
    classDescription: "Data URIs with chrome privileges",
    QueryInterface:   XPCOMUtils.generateQI([Ci.nsIProtocolHandler]),
    _xpcom_factory: {
        createInstance: function (outer, iid) {
            if (!ChromeData.instance)
                ChromeData.instance = new ChromeData();
            if (outer != null)
                throw Components.results.NS_ERROR_NO_AGGREGATION;
            return ChromeData.instance.QueryInterface(iid);
        }
    },

    scheme: "chrome-data",
    defaultPort: -1,
    allowPort: function (port, scheme) false,
    protocolFlags: nsIProtocolHandler.URI_NORELATIVE
         | nsIProtocolHandler.URI_NOAUTH
         | nsIProtocolHandler.URI_IS_UI_RESOURCE,

    newURI: function (spec, charset, baseURI) {
        var uri = Cc["@mozilla.org/network/standard-url;1"]
                    .createInstance(Ci.nsIStandardURL)
                    .QueryInterface(Ci.nsIURI);
        uri.init(uri.URLTYPE_STANDARD, this.defaultPort, spec, charset, null);
        return uri;
    },

    newChannel: function (uri) {
        try {
            if (uri.scheme == this.scheme)
                return makeChannel(uri.spec.replace(/^.*?:\/*(.*)(?:#.*)?/, "data:$1"), uri);
        }
        catch (e) {}
        return fakeChannel();
    }
};

function Liberator() {
    this.wrappedJSObject = this;

    const self = this;
    this.HELP_TAGS = {};
    this.FILE_MAP = {};
    this.OVERLAY_MAP = {};
}
Liberator.prototype = {
    contractID:       "@mozilla.org/network/protocol;1?name=liberator",
    classID:          Components.ID("{9c8f2530-51c8-4d41-b356-319e0b155c44}"),
    classDescription: "Liberator utility protocol",
    QueryInterface:   XPCOMUtils.generateQI([Ci.nsIProtocolHandler]),
    _xpcom_factory: {
        createInstance: function (outer, iid) {
            if (!Liberator.instance)
                Liberator.instance = new Liberator();
            if (outer != null)
                throw Components.results.NS_ERROR_NO_AGGREGATION;
            return Liberator.instance.QueryInterface(iid);
        }
    },

    init: function (obj) {
        for each (let prop in ["HELP_TAGS", "FILE_MAP", "OVERLAY_MAP"]) {
            this[prop] = this[prop].constructor();
            for (let [k, v] in Iterator(obj[prop] || {}))
                this[prop][k] = v
        }
    },

    scheme: "liberator",
    defaultPort: -1,
    allowPort: function (port, scheme) false,
    protocolFlags: 0
         | nsIProtocolHandler.URI_IS_UI_RESOURCE
         | nsIProtocolHandler.URI_IS_LOCAL_RESOURCE,

    newURI: function (spec, charset, baseURI) {
        var uri = Cc["@mozilla.org/network/standard-url;1"]
                    .createInstance(Ci.nsIStandardURL)
                    .QueryInterface(Ci.nsIURI);
        uri.init(uri.URLTYPE_STANDARD, this.defaultPort, spec, charset, baseURI);

        if (uri.host !== "template") return uri;

        try {
        spec = uri.spec;
        //uri.init(uri.URLTYPE_STANDARD, this.defaultPort, uri.path.substr(1), charset, null);
        // xxx:
        uri = ioService.newURI(uri.path.replace(new RegExp("^/+"), ""), charset, null);
        // recursible when override
        while (uri.scheme === "chrome") {
            uri = Cc["@mozilla.org/chrome/chrome-registry;1"]
                .getService(Ci.nsIChromeRegistry)
                .convertChromeURL(uri);
        }

        var nest = Cc["@mozilla.org/network/util;1"].getService(Ci.nsINetUtil).newSimpleNestedURI(uri);
        nest.spec = spec;
        } catch (ex) { Cu.reportError(ex); }
        return nest;
    },

    newChannel: function (uri) {
        try {
            if ((uri instanceof Ci.nsINestedURI)) {
                var m = (new RegExp("^/{2,}([^/]+)/([^?]+)")).exec(uri.path);
                if (m) {
                    var host = m[1];
                    var path = m[2];

                    switch (host) {
                    case "template":
                        try {
                        var nest = ioService.newURI(path, uri.charset, null);
                        var channel = ioService.newChannelFromURI(nest);

                        // xxx: support template
                        if (0) return channel;

                        // xxx: NG: Firefox 16, 17
                        //      NG: Cu.import
                        if (parseFloat(version) < 17) {
                            var stream = Cc["@mozilla.org/scriptableinputstream;1"]
                                            .createInstance(Ci.nsIScriptableInputStream);
                            var cstream = channel.open();
                            stream.init(cstream);
                            var text = stream.read(-1);
                            stream.close();
                            cstream.close();

                            stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
                            stream.setData(convert(text), -1);
                            var channel = Cc["@mozilla.org/network/input-stream-channel;1"]
                                .createInstance(Ci.nsIInputStreamChannel);
			                channel.contentStream = stream;
                            channel.QueryInterface(Ci.nsIChannel);
                            channel.setURI(uri);
                            return channel;
                        }

                        var innerURI = uri.innerURI;
                        var temp = cache.clone();
                        var path = nest.spec.replace(/[:\/]/g, "_");
                        var lastModifiedTime;
                        if (innerURI.scheme === "resource") {
                            innerURI = Cc["@mozilla.org/network/protocol;1?name=resource"]
                                .getService(Ci.nsIResProtocolHandler).resolveURI(innerURI);
                            innerURI = ioService.newURI(innerURI, null, null);
                        }
                        if (innerURI.scheme === "jar") {
                            innerURI = innerURI.QueryInterface(Ci.nsIJARURI).JARFile;
                        }
                        if (innerURI.scheme === "file") {
                            lastModifiedTime = innerURI.QueryInterface(Ci.nsIFileURL).file.lastModifiedTime;
                        } else {
                            Cu.reportError("do not support:" + innerURI.spec);
                        }

                        temp.append(path);
                        if (!temp.exists()
                            || temp.lastModifiedTime !== lastModifiedTime) {

                            var stream = Cc["@mozilla.org/scriptableinputstream;1"]
                                            .createInstance(Ci.nsIScriptableInputStream);
                            var cstream = channel.open();
                            stream.init(cstream);
                            var text = stream.read(-1);
                            stream.close();
                            cstream.close();

                            text = convert(text);

                            var stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
                            Services.console.logStringMessage("create:" + temp.leafName);
                            stream.init(temp, 0x2 | 0x8 | 0x20, 0644, 0);
                            stream.write(text, text.length);
                            stream.close();
                            temp.lastModifiedTime = lastModifiedTime;
                        } else { Services.console.logStringMessage("use cache:" + uri.spec); }
                        return ioService.newChannelFromURI(ioService.newFileURI(temp));
                        } catch (ex) { Cu.reportError(ex); }
                    }
                }
                return fakeChannel(uri);
            }
            switch(uri.host) {
                case "help":
                    let url = this.FILE_MAP[uri.path.replace(/^\/|#.*/g, "")];
                    return makeChannel(url, uri);
                case "help-overlay":
                    url = this.OVERLAY_MAP[uri.path.replace(/^\/|#.*/g, "")];
                    return makeChannel(url, uri);
                case "help-tag":
                    let tag = uri.path.substr(1);
                    if (tag in this.HELP_TAGS)
                        return redirect("liberator://help/" + this.HELP_TAGS[tag] + "#" + tag, uri);
            }
        }
        catch (e) { Cu.reportError(e); }
        return fakeChannel(uri);
    }
};

var components = [ChromeData, Liberator];

if(XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
else
    function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule(components);

// vim: set fdm=marker sw=4 ts=4 et:
