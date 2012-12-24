// vim: set fdm=marker:
var EXPORTED_SYMBOLS = ["raw", "safehtml", "tmpl", "xml", "e4x", "cooked"];

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
    const re = new RegExp("[" + [c for (c in c2c)].join("") + "]", "g");
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

function TemplateTmpl(s) {this.value = s;} //{{{
TemplateTmpl.prototype = new TemplateSupportsXML;
TemplateTmpl.prototype.toString = function () this.value;
TemplateTmpl.prototype.toXMLString = function () {
    var str = this.value;
    const whiteSpace = /^\s*/y;
    const tagToken = /^([^`"',\s\[\]\{\}\(\)]+)\s*(\[)?/y;
    const attrToken = /^\s*([^\s=]+)\s*=\s*(\S)/y;
    const attrSep = /^\s*(\s|])/y;
    const STATE = 0, NAME = 1, OPEN = 2;
    const TAG = {}, ROOT = {}, GROUP = {};
    var offset = 0;
    var start = 0;
    var res = "";
    var stack = [];
    var depth = 0;
    var state = [ROOT];
    var m;
    label_root: while (1) {
        whiteSpace.lastIndex = offset;
        m = whiteSpace.exec(str);
        if (!m) throw SyntaxError("ws");
        offset = whiteSpace.lastIndex;
        c = str[offset++];
        if (!c) break;
        switch (c) {
        case "{":
            if (state[STATE] === TAG && state[OPEN]) {
                res += ">";
                state[OPEN] = false;
            }
            start = offset;
            while (c = str[offset++]) {
                if (c === "\\") {
                    res += str.substring(start, offset - 1);
                    start = offset++;
                }
                else if (c === "}") {
                    res += escapeHTML(str.substring(start, offset - 1));
                    continue label_root;
                }
            }
            throw SyntaxError("text");
        case "`":
            if (state[STATE] === TAG && state[OPEN]) {
                res += ">";
                state[OPEN] = false;
            }
            start = offset;
            while (c = str[offset++]) {
                if (c === "\\") {
                    res += str.substring(start, offset - 1);
                    start = offset++;
                } else if (c === "`") {
                    res += str.substring(start, offset - 1);
                    continue label_root;
                }
            }
            throw SyntaxError("xml");
        case "(":
            if (state[STATE] === TAG && state[OPEN]) {
                res += ">";
                state[OPEN] = false;
            }
            stack[depth++] = state;
            state = [GROUP];
            break;
        case ")":
            do {
                switch (state[STATE]) {
                case TAG:
                    if (state[OPEN]) {
                        res += "/>";
                        state[OPEN] = false;
                    } else {
                        res += "</" + state[NAME] + ">";
                    }
                    break;
                case GROUP:
                    state = stack[--depth];
                    continue label_root;
                case ROOT:
                    throw SyntaxError(")");
                }
            } while (state = stack[--depth]);
            throw SyntaxError(")");
        case ",":
            do {
                switch (state[STATE]) {
                case TAG:
                    if (state[OPEN]) {
                        res += "/>";
                        state[OPEN] = false;
                    } else {
                        res += "</" + state[NAME] + ">";
                    }
                    break;
                case GROUP:
                case ROOT:
                    continue label_root;
                }
            } while (state = stack[--depth]);
            throw SyntaxError(")");
        default:
            if (state[STATE] === TAG && state[OPEN]) {
                res += ">";
                state[OPEN] = false;
            }
            tagToken.lastIndex = offset - 1;
            m = tagToken.exec(str);
            if (!m) throw SyntaxError("tag");
            offset = tagToken.lastIndex;
            res += "<" + m[1];
            stack[depth++] = state;
            state = [TAG, m[1], true];
            if (m[2]) {
                label_attr: while (1) {
                    attrToken.lastIndex = offset;
                    m = attrToken.exec(str);
                    if (!m) throw new SyntaxError("attr");
                    offset = attrToken.lastIndex;
                    res += " " + m[1] + "=";
                    start = offset;
                    close = m[2];
                    while (c = str[offset++]) {
                        if (c === close) {
                            res += close + str.substring(start, offset - 1) + close;
                            attrSep.lastIndex = offset;
                            m = attrSep.exec(str);
                            if (!m) throw SyntaxError("attr sep");
                            offset = attrSep.lastIndex;
                            if (m[1] === "]") {
                                break label_attr;
                            }
                            continue label_attr;
                        }
                    }
                }
            }
            break;
        }
    }
    if (state[STATE] === TAG) res += state[OPEN] ? "/>" : "</" + state[NAME] + ">";
    while (state = stack[--depth]) {
        if (state[STATE] === TAG)
            res += "</" + state[NAME] + ">";
    }
    return res;
};//}}}

function templateTmpl(portion, args) // {{{
{
    var res = "";

    const BODY = {}, ATTR1 = {}, ATTR2 = {}, TEXT = {}, XML = {};

    var c;
    var raw = portion.raw;
    var i = 0, j = args.length;

    var depth = 0;

    var state = BODY, offset = 0;
    var str = raw[0], arg = args[0];
    var res = str;
    label_root: while (1) {
        switch(state) {
        case BODY:
            while (c = str[offset++]) {
                switch (c) {
                case "[":
                    state = ATTR1;
                    continue label_root;
                case "`":
                    state = XML;
                    continue label_root;
                case "{":
                    state = TEXT;
                    continue label_root;
                case "(":
                    depth++;
                    break;
                case ")":
                    if (--depth < 0) throw SyntaxError("depth");
                    break;
                }
            }
            if (i >= j) break label_root;
            else if (typeof arg === "xml") {
                res += "`" + arg.toXMLString().replace(/([\\`])/g, "\\$1", "g") + "`";
            } else if (arg instanceof TemplateTmpl) {
                res += "(" + arg.value + ")";
            } else if (arg instanceof TemplateXML) {
                res += "`" + arg.value.replace(/([\\`])/g, "\\$1", "g") + "`";
            } else {
                res += "{" + String.replace(arg, /([\\}])/g, "\\$1") + "}";
            }
            break;
        case ATTR1:
            while (c = str[offset++]) {
                if (c === "=") {
                    state = ATTR2;
                    continue label_root;
                } else if (c === "]") {
                    state = BODY;
                    continue label_root;
                }
            }
            if (i >= j) throw SyntaxError("attr left");
            arg = String(arg);
            if (/[=\[\]!"#$%&']/.test(arg)) throw SyntaxError("substitude:" + i);
            res += arg;
            break;
        case ATTR2:
            c1 = str[offset++];
            if (!c1) {
                if (i >= j) throw SyntaxError("attr right");
                arg = String(arg);
                res += '"' + String.replace(arg, /"/g, '\\"', "g") + '"';
                state = ATTR1;
                break;
            }
            else if (c1 === "{") c1 = "}";
            while (c = str[offset++]) {
                if (c === "\\") offset++;
                else if (c === c1) {
                    state = ATTR1;
                    continue label_root;
                }
            }
            // do not support attribute's value nesting
            throw SyntaxError("attr2");
            break;
        case TEXT:
            while (c = str[offset++]) {
                if (c === "\\") offset++;
                else if (c === "}") {
                    state = BODY;
                    continue label_root;
                }
            }
            if (i >= j) throw SyntaxError("text");
            arg = String(arg);
            res += '{' + String.replace(arg, /}/g, '\\}', "g") + '}';
            break;
        case XML:
            while (c = str[offset++]) {
                if (c === "\\") offset++;
                else if (c === "`") {
                    state = BODY;
                    continue label_root;
                }
            }
            // do not support xml nesting
            throw SyntaxError("xml");
            break;
        default:
            throw SyntaxError("unknown state");
        }

        str = raw[++i];
        arg = args[i];
        res += str;
        offset = 0;
    }
    if (depth !== 0) throw SyntaxError("depth");
    return new TemplateTmpl(res);
}

// xxx: no check
templateTmpl.raw = function templateTmplRaw(portion, args) {
    return new TemplateTmpl(templateRaw(portion, args));
};
templateTmpl.map = function templateTmplMap(data, fn) {
    var val, res = "";
    for (var i = 0, j = data.length; i < j; i++) {
        val = fn(data[i]);
        if (val instanceof TemplateTmpl)
            res += "(" + val.value + ")";
        else if (typeof val === "xml")
            res += encodeTmplXml(val.toXMLString());
        else if (val instanceof TemplateXML)
            res += encodeTmplXml(val.value);
        else
            res += encodeTmplText(val);
    }
    return new TemplateTmpl(res);
};
templateTmpl.is = function is(obj) {
    return obj instanceof TemplateTmpl;
};
templateTmpl.isEmpty = function isEmpty() {
    return (value instanceof TemplateXML || value instanceof TemplateTmpl) && value.value === "";
};
templateTmpl["+="] = function (self, value) {
    if (!(self instanceof TemplateTmpl)) throw SyntaxError();
    else if (value instanceof TemplateTmpl)
        self.value += "(" + value.value + ")";
    else if (value instanceof TemplateXML)
        self.value += "`" + value.value.replace(/`/g, "\\`") + "`";
    else if (typeof value === "xml")
        self.value += "`" + value.toXMLString().replace(/`/g, "\\`") + "`";
    else
        self.value = "{" + String(value).replace(/}/g, "\\}") + "}";
    return self;
};
//}}}

function templateXML(portion, args) // {{{
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
            else if (arg instanceof TemplateTmpl || typeof arg === "xml") {
                res += arg.toXMLString();
            } else if (arg instanceof TemplateXML) {
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
            whiteSpace.exec(str);
            offset = whiteSpace.lastIndex;
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
        if (val instanceof TemplateTmpl || typeof val === "xml")
            res += val.toXMLString();
        else if (val instanceof TemplateXML)
            res += val.value;
        else
            res += val;
    }
    return new TemplateXML(res);
}

// xxx: xml check
templateXML.raw = function templateXmlRaw(portion, args) {
    var str = templateRaw(portion, args);
    var ps = new DOMParser
    var doc = ps.parseFromString("<root>" + str + "</root>", "text/xml");
    if (doc.documentElement.tagName === "parsererror") {
        throw SyntaxError(doc.documentElement.childNodes[0].data);
    }
    return new TemplateXML(str);
};
templateXML.cdata = function templateXmlCDATA(portion, args) {
    return new TemplateXML("<![CDATA[" + templateRaw(portion, args).replace(/>/g, "&gt;") + "]]>");
};
templateXML["+="] = function (self, value) {
    if (!(self instanceof TemplateXML)) throw SyntaxError();
    else if (value instanceof TemplateTmpl)
        self.value += value.toXMLString();
    else if (value instanceof TemplateXML)
        self.value += value.value;
    else if (typeof value === "xml")
        self.value += value.toXMLString();
    else
        self.value += escapeHTML(value);
    return self;
};
templateXML.is = function is(obj) {
    return obj instanceof TemplateXML; 
};
templateXML.isEmpty = function (value) {
    return (value instanceof TemplateXML || value instanceof TemplateTmpl) && value.value === "";
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

function templateCooked(portion, args) {
    var str = portion.cooked;
    var i = 0, j = args.length, res = str[0];
    while (i < j) {
        res += args[i++];
        res += str[i];
    }
    return res;
}

function templateSafeHtml(portion, args) {
    var raw = portion.raw;
    var i = 0, j = args.length, res = raw[0];
    while (i < j) {
        res += escapeHTML(args[i++]);
        res += raw[i];
    }
    return res;
}

function templateE4X(portion, args) // e4x {{{
{
    try {
    return new XMLList(templateXML(portion, args).value);
    } catch (ex) {
        alert(ex.stack);
        throw ex;
    }
}
templateE4X.raw = function raw(portion, args) {
    return new XMLList(templateRaw(portion, args));
};
templateE4X.cdata = function cdata(portion, args) {
    return new XMLList("<![CDATA[" + templateRaw(portion, args).replace(/>/g, "&gt;") + "]]>");
};
templateE4X["+"] = function operatorPlus(lhs, rhs) {
    function toE4X(a) {
        if (a instanceof TemplateTmpl)
            return new XMLList(a.toXMLString());
        else if (a instanceof TemplateXML)
            return new XMLList(a.toString());
        else
            return a;
    }
    return toE4X(lhs) + toE4X(rhs);
};
// xxx: xml object to E4X
templateE4X.cast = function cast(obj) {
    if (obj instanceof TemplateTmpl)
        return new XMLList(obj.toXMLString());
    else if (obj instanceof TemplateXML)
        return new XMLList(obj.value);
    else
        return obj;
};
templateE4X["+="] = function (self, value) {
    if (typeof self !== "xml") throw SyntaxError();
    self += templateE4X.cast(value);
    return self;
};
//}}}

var tmpl = templateTmpl;
var xml = templateXML;
var e4x = templateE4X;
var raw = templateRaw;
var cooked = templateCooked;
var safehtml = templateSafeHtml;

