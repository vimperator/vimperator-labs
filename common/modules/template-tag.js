// vim: set fdm=marker:
var EXPORTED_SYMBOLS = ["xml", "TemplateSupportsXML"] ;

// {{{ escape function
//var obj1 = {};
//var obj2 = {};
//var c;
//
//function $s(s) {
//    s = s.quote();
//    return s.substring(1, s.length -1);
//}
//for (var i = 0, j = 0x7fff; i < j; i++) {
//    c = String.fromCharCode(i);
//    var xml = <>{c}</>.toXMLString();
//    if (xml !== c) obj1[$s(c)] = xml;
//    xml = <a a={c}/>.@a.toXMLString();
//    if (xml !== c) obj2[$s(c)] = xml;
//}
//alert(JSON.stringify([obj1, obj2], null, 1));
function createEscapeFunc(obj) {
    const c2c = obj;
    const re = new RegExp("[" + Object.keys(c2c).join("") + "]", "g");
    return function _escapeFunc(s) String(s).replace(re, function (c) c2c[c]);
}

var escapeHTML = createEscapeFunc({
    //"\r":     "\n",
    "&":       "&amp;",
    "<":       "&lt;",
    ">":       "&gt;",
    "\u2028": "\n",
    "\u2029": "\n"
});
var escapeAttribute = createEscapeFunc({
    "\t":     "&#x9;",
    "\n":     "&#xA;",
    "\r":     "&#xD;",
    "\"":     "&quot;",
    "&":      "&amp;",
    "<":      "&lt;",
    "\u2028": "&#xA;",
    "\u2029": "&#xA;"
});

function escapeBackQuote(s) {
    return String.replace(s, /`/g, "\\`");
}
function encodeTmplXml(xml) {
    return "`" + String.replace(s, /`/g, "\\`") + "`";
}
function encodeTmplText(text) {
    return "{" + String.replace(s, /}/g, "\\}") + "}";
}
// }}}

function TemplateSupportsXML() {}

function TemplateXML(s) {this.value = s;}
TemplateXML.prototype = new TemplateSupportsXML;
TemplateXML.prototype.toString = function () this.value;

function templateXML(portion, ...args) // {{{
{
    var res = "";

    const BODY = {}, ATTR1 = {}, ATTR2 = {}, TEXT = {}, XML = {}, CC = {}, TAG_OPEN = {} , TAG_CLOSE = {};

    var c;
    var raw = portion.raw;
    var i = 0, j = args.length;
    const whiteSpace = /^\s*/y;

    var state = BODY, offset = 0;
    var str = raw[0], arg = args[0];
    var res = str;
    var str2, close;
    var depth = 0;
    function DepthError() {
        throw SyntaxError("depth erro: " + [depth, offset, str.substr(offset - 8, 16), res.substr(-32), (new Error).stack]);
    }

    label_root: while (1) {
        switch(state) {
        case BODY:
            while (c = str[offset++]) {
                if (c === "<") {
                    offset--;
                    str2 = str.substr(offset, 16);
                    if (!str2.lastIndexOf("<![CDATA[", 0)) {
                        state = CC;
                        close = "]]>";
                        offset += 9;
                        continue label_root;
                    } else if (!str2.lastIndexOf("<!--", 0)) {
                        state = CC;
                        close = "-->";
                        offset += 4;
                        continue label_root;
                    } else if (!str2.lastIndexOf("</", 0)) {
                        if (--depth < 0) DepthError();
                        state = TAG_CLOSE;
                        offset += 2;
                        continue label_root;
                    } else if (str2[0] === "<") {
                        state = TAG_OPEN;
                        offset++;
                        if (/\s|>/.test(str[offset])) throw SyntaxError("tagname");
                        continue label_root;
                    }
                    throw SyntaxError("body: " + offset);
                }
            }
            if (i >= j) break label_root;
            else if (arg instanceof TemplateXML) {
                res += arg.value;
            } else if (arg instanceof TemplateSupportsXML) {
                res += (arg.toXMLString || arg.toString)();
            } else {
                res += escapeHTML(arg);
            }
            break;
        case CC:
            offset = str.indexOf(close, offset);
            if (offset === -1) {
                if (i >= j) throw SyntaxError(close);
                res += escapeHTML(arg);
                break;
            }
            offset += close.length;
            state = BODY;
            continue label_root;
        case TAG_OPEN:
            while (c = str[offset++]) {
                if (!/\s/.test(c)) {
                    state = ATTR1;
                    continue label_root;
                }
            }
            if (i >= j) throw SyntaxError("tag");
            arg = String(arg);
            //if (/\s/.test(arg)) throw SyntaxError("tagname");
            res += arg;
            break;
        case TAG_CLOSE:
            while (c = str[offset++]) {
                if (c === ">") {
                    state = BODY;
                    continue label_root;
                } //else if (chk) throw SyntaxError("closetag");
            }
            if (i >= j) throw SyntaxError("tag close");
            arg = String(arg);
            //if (/\s/.test(arg)) throw SyntaxError("closetagname");
            res += arg;
            break;
        case ATTR1:
            while (c = str[offset++]) {
                if (c === "=") {
                    state = ATTR2;
                    continue label_root;
                } else if (c === ">") {
                    depth++;
                    state = BODY;
                    continue label_root;
                } else if (c === "/") {
                    c = str[offset++];
                    if (c === ">") {
                        state = BODY;
                        continue label_root;
                    }
                    else throw SyntaxError("/");
                }
            }
            if (i >= j) throw SyntaxError("attr left");
            arg = String(arg);
            res += arg;
            break;
        case ATTR2:
            whiteSpace.lastIndex = offset;
                if (whiteSpace.exec(str)) {
                        offset = whiteSpace.lastIndex;
                   }
            close = str[offset++];
            if (!close) {
                if (i >= j) throw SyntaxError("attr right");
                res += '"' + escapeAttribute(arg) + '"';
                state = ATTR1;
                break;
            } else if (close === '"' || close === "'") {
                while (c = str[offset++]) {
                    if (c === close) {
                        state = ATTR1;
                        continue label_root;
                    }
                }
            }
            throw SyntaxError("attr2");
        default:
            throw SyntaxError("unknown state");
        }

        str = raw[++i];
        arg = args[i];
        res += str;
        offset = 0;
    }
    if (depth !== 0) DepthError();
    return new TemplateXML(res);
}
templateXML.map = function templateXmlMap(data, fn) {
    var val, res = "";
    for (var i = 0, j = data.length; i < j; i++) {
        val = fn(data[i]);
        if (val instanceof TemplateXML)
            res += val.value;
        else
            res += val;
    }
    return new TemplateXML(res);
}

var DOMParser = Components.Constructor("@mozilla.org/xmlextras/domparser;1");
// xxx: xml check
templateXML.raw = function templateXmlRaw(portion, ...args) {
    var str = templateRaw(portion, args);
    var ps = DOMParser();
    var doc = ps.parseFromString("<root>" + str + "</root>", "text/xml");
    if (doc.documentElement.tagName === "parsererror") {
        throw SyntaxError(doc.documentElement.childNodes[0].data);
    }
    return new TemplateXML(str);
};
templateXML.cdata = function templateXmlCDATA(portion, ...args) {
    return new TemplateXML("<![CDATA[" + templateRaw(portion, args).replace(/>/g, "&gt;") + "]]>");
};
templateXML["+="] = function (self, value) {
    if (!(self instanceof TemplateXML)) throw SyntaxError();
    else if (value instanceof TemplateXML)
        self.value += value.value;
    else
        self.value += escapeHTML(value);
    return self;
};
templateXML.is = function is(obj) {
    return obj instanceof TemplateXML;
};
templateXML.isEmpty = function (value) {
    return (value instanceof TemplateXML) && value.value === "";
};
//}}}

function templateRaw(portion, args) {
    var raw = portion.raw;
    var i = 0, j = args.length, res = raw[0];
    while (i < j) {
        res += args[i++];
        res += raw[i];
    }
    return res;
}

var xml = templateXML;
