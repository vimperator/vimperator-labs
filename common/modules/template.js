var EXPORTED_SYMBOLS = ["convert"];
const Cu = Components.utils;

//
// STATE
// ALL
//      0 TYPE
// TEMPLATE
//      1 HAS_HANDLER
//      2 RESULT
//      3 RAW
//      4 SUBSTITUDE
// ROUND1
//      1 keyword
function convert(str, options) {
    function fnRawEscape(str) {
        return ({
            "\n":   "\\n\\\n",
            "\r\n": "\\n\\\n",
            "\r":   "\\n\\\n",
            '"':    '\\"',
            "\\":   '\\\\',
        })[str];
    }
    const reRawEscape = /\r\n?|\n|"|\\/g;
    const reEOL = /\r\n|[\r\n]/g;

    //const TEMPLATE = {}, TEMPLATE_PORTION = {}, SQUARE = {}, ROUND = {}, CURLY = {}, ROUND1 = {}, ROOT = {};
    const TEMPLATE = {s:"t"}, TEMPLATE_PORTION = {s: "tp"}, SQUARE = {s: "s["}, ROUND = {s:"s("}, CURLY = {s:"s{"}, ROUND1 = {s:"fn"}, ROUND1IN = {s: "in("}, ROOT = {s:"r"};
    const TYPE = 0, HAS_HANDLER = 1, RESULT = 2, RAW = 3, SUBSTITUDE = 4;
    var c, c0, c1, m, q_str, i, j;
    var start = 0, offset = 0;
    var isOp = false;
    var whiteSpace = /^\s*/y;
    var op = "!\"#%&'()=-~^\\`@+;*:{[}]<>,?/";
    var idToken = new RegExp("^[^\\" + op.split("").join("\\") + "\\s]+", "y");
    var expressionToken = /^\s*\(/y;
    var reOpt = /^[igmy]*/y;
    var last = str.length;
    var stack = [];
    const BackSlash  = '\\';
    var RET = '\r';
    var NL  = '\n';
    var BQ  = '`';
    var $ = '$';
    var re;
    var depth = 0;
    var state = [ROOT, null]; //xxx:
    var raw, substitude, args, hasHandler, cooked;
    res = "";
    root_loop: while (offset < last) {
        // white space
        whiteSpace.lastIndex = offset;
        m = whiteSpace.exec(str);
        if (!m) break;
        offset = whiteSpace.lastIndex;
        c = str[offset++];
        if (!c) break;

        //xxx: goto
        goto_switch: while (1) {
        switch (c) {
        case "/":
            c0 = str[offset];
            if (c0 === "/") {
                reEOL.lastIndex = offset;
                m = reEOL.exec(str);
                if (!m) break root_loop;
                offset = reEOL.lastIndex;
                continue root_loop;
            } else if (c0 === "*") {
                offset = str.indexOf("*/", offset + 1) + 2;
                if (offset === 1) break root_loop;
                continue root_loop;
            // xxx: 
            } else if (isOp) {
                if (c0 === "=") {
                    offset++;
                }
                isOp = false;
            } else {
                // RegExp Literal
                var x = offset;
                while (c0 = str[offset++]) {
                    if (c0 === "\\") {
                        offset++;
                    //} else if (c0 === NL || c0 === RET) {
                    //    break root_loop;
                    } else if (c0 === "/") {
                        reOpt.lastIndex = offset;
                        m = reOpt.exec(str);
                        offset = reOpt.lastIndex;
                        break;
                    } else if (c0 === "[") {
                        while (c1 = str[offset++]) {
                            if (c1 === "\\") offset++;
                            else if (c1 === "]") {
                                break;
                            }
                        }
                    }
                }
                isOp = true;
            }
            break;
        case "`":
            res += str.substring(start, offset - 1);
            start = offset;

            stack[depth++] = state;
            state = [TEMPLATE, isOp, res, [], []];
            res = "";
            //c = TEMPLATE_PORTION;
            //continue goto_switch;
            //break;
        case TEMPLATE_PORTION:
            start = offset;
            q_str = "";
            while (c0 = str[offset++]) {
                if (c0 === "\\") offset++;
                else if (c0 === "`") {
                    // end quansi literal
                    res = state[RESULT];
                    hasHandler = state[HAS_HANDLER];
                    args = state[RAW];
                    substitude = state[SUBSTITUDE];

                    args[args.length] = q_str + str.substring(start, offset -1);


                    if (hasHandler) {
                        raw = args;

                        //xxx: cooked is not implement
                        cooked = [];
                        for (i = 0, j = raw.length; i < j; i++) {
                            cooked[i] = raw[i].replace(/(\\*)([\r\n]+|")/g, function (str, bs, c) {
                                var n = bs.length;
                                if (n % 2) {
                                    if (c !== '"') str = bs.substr(1);
                                } else {
                                    if (c === '"') str = "\\" + str;
                                    else {
                                        str = bs;
                                    }
                                }
                                return str;
                            });
                            raw[i] = raw[i].replace(reRawEscape, fnRawEscape);
                        }

                        substitude = substitude.length ? "(" + substitude.join("), (") + ")" : "";
                        res +=
'({\
raw: ["' + raw.join('", "') + '"],\
cooked: ["' + cooked.join('", "') + '"]' +
'}, [' + substitude + '])';

                    } else {
                        // default handler
                        if (args.length === 1) {
                            res += '"' + args[0].replace(reRawEscape, fnRawEscape) + '"';
                        } else {
                            res += '("' + args[0].replace(reRawEscape, fnRawEscape) + '"';
                            for (i = 0, j = substitude.length; i < j; i++) {
                                res += ' + (' + substitude[i] + ') + "' + args[i + 1].replace(reRawEscape, fnRawEscape) + '"';
                            }
                            res += ")";
                        }
                    }
                    //end flush
                    state = stack[--depth];
                    start = offset;
                    isOp = true;
                    continue root_loop;
                } else if (c0 === $) {
                    c1 = str[offset];

                    // close TemplateLiteralPortion
                    if (c1 === "{") // c1 === "{"
                    {
                        var args = state[RAW];
                        args[args.length] = q_str + str.substring(start, offset -1);
                        offset++;
                        start = offset;
                        isOp = false;
                        continue root_loop;
                    }
                }
            }
            break root_loop;
        case "'": case '"':
            //string literal
            for (c0 = str[offset++]; offset < last && c0 !== c; c0 = str[offset++]) {
                if (c0 === BackSlash) offset++;
            }
            isOp = true;
            break;
        case ";":
            isOp = false;
            break;
        case ":":
            if (state[TYPE] === ROUND1) {
                state = stack[--depth];
            }
            isOp = false;
            break;
        case "+": case "-": case "*": case "=": case ",":
        case "!": case "|": case "&": case ">": case "%": case "~":
        case "^": case "<": case "?": case ";":
            isOp = false;
            break;
        case "(":
            var aType = state[TYPE];
            if (aType === ROUND1) {
                state[TYPE] = ROUND1IN;
            } else {
                stack[depth++] = state;
                state = [ROUND, offset];
            }
            isOp = false;
            break;
        case ")":
            switch (state[TYPE]) {
            case ROUND:
                state = stack[--depth];
                isOp = true;
                break;
            case ROUND1IN:
                state = stack[--depth];
                isOp = false;
                break;
            default:
                break root_loop;
                throw SynstaxError("MissMatch:)");
                break;
            }
            break;
        case "{":
            stack[depth++] = state;
            state = [CURLY, null, offset];
            isOp = false;
            break;
        case "}":
            switch (state[TYPE]) {
            // Template's Substitution
            case TEMPLATE:
                args = state[SUBSTITUDE];
                args[args.length] = res + str.substring(start, offset - 1);
                res = "";
                c = TEMPLATE_PORTION;
                start = offset;
                continue goto_switch;
            case CURLY:
                state = stack[--depth];
                isOp = false;
                break;
            default:
                break root_loop;
                throw SynstaxError("MissMatch:}");
            }
            break;
        case "[":
            stack[depth++] = state;
            state = [SQUARE, null];
            isOp = false;
            break;
        case "]":
            if (state[0] === SQUARE) {
                state = stack[--depth];
                isOp = true;
            //xxx: error
            } else { break root_loop; } //throw SyntaxError();
            break;
        default:

            //xxx: e4x attribute
            if (c === "@" && str[offset - 2] === ".") {
                if (str[offset++] === "*") {
                    break;
                }
            }
            idToken.lastIndex = offset - 1;
            m = idToken.exec(str);
            if(!m) break root_loop;
            word = m[0];

            if (state[TYPE] === ROUND1 && state[1] === "let") {
                state = stack[--depth];
            } else {
                switch (word) {
                case "get": case "set":
                    offset = idToken.lastIndex;
                    goto_getset: while (1) {
                        whiteSpace.lastIndex = offset;
                        m = whiteSpace.exec(str);
                        if (!m) break root_loop;
                        offset = whiteSpace.lastIndex;
                        c = str[offset++];
                        if (c === "/") {
                            c = str[offset++];
                            if (c === "*") {
                                // skip comment
                                offset = str.indexOf("*/", offset) + 2;
                                if (offset === 1) break root_loop;
                            } else if (c === "/") {
                                // skip line
                                reEOL.lastIndex = offset;
                                m = reEOL.exec(str);
                                if (!m) break root_loop;
                                offset = reEOL.lastIndex;
                            } else {
                                // c is divide
                                continue goto_switch;
                            }
                        } else {
                            if (op.indexOf(c) >= 0) {
                                // get/set is variable name
                                isOp = true;
                            } else {
                                // c is getter/setter name
                                isOp = true;
                                stack[depth++] = state;
                                state = [ROUND1, word, offset];
                            }
                            continue goto_switch;
                        }
                    } break;
                case "if": case "while": case "for": case "with": case "catch": case "function": case "let":
                    offset = idToken.lastIndex;
                    if (word === "if" && state[TYPE] === ROUND1IN && state[1] === "catch") {
                        state = [ROUND, offset, state];
                    } else {
                        stack[depth++] = state;
                        state = [ROUND1, word, offset];
                    }
                    isOp = false;
                    break;
                case "delete": case "new":    case "return": case "yield": case "in":   case "instanceof":
                case "case":   case "typeof": case "var":    case "const": case "void": case "else":
                    offset = idToken.lastIndex;
                    isOp = false;
                    break;
                default:
                    offset = idToken.lastIndex;
                    isOp = true;
                }
            }
            break;
        }
        break; } // goto_switch: while (1)
    }
    if (depth > 0) {
        reEOL.lastIndex = 0;
        let lineNumber = (str.substr(0, offset).match(reEOL)||[]).length + 1;
        Cu.reportError([lineNumber, str.substr(offset -16, 16).quote(), str.substr(offset, 16).quote()]);
        Cu.reportError(JSON.stringify(stack.slice(0, depth), null, 1));

        // force build source
        stack[depth] = state;
        Cu.reportError(JSON.stringify(stack.slice(0, depth + 1), null, 1));
        let rest = str.substring(start);
        while (state = stack[depth--]) {
            if (state[0] === TEMPLATE) {
                let [,,tag, raw, args] = state;

                raw = raw.map(function (r) '"' + r.replace(reRawEscape, fnRawEscape) + '"');

                if (raw.length === args.length) {
                    raw.push('`"' + rest.replace(reRawEscape, fnRawEscape) + '"`');
                } else {
                    args.push("`" + res + rest + "`");
                    res = "";
                }
                rest = tag + "(({raw: [" + raw.join(", ") + "]}), [" + args.join(", ") + "])";
                break;
            }
        }
        while (state = stack[depth--]) {
            if (state[0] === TEMPLATE) {
                let [,,tag, raw, args] = state;
                raw = raw.map(function (r) '"' + r.replace(reRawEscape, fnRawEscape) + '"');
                args.push(rest);
                rest = tag + "(({raw: [" + raw.join(", ") + "]}), [" + args.join(", ") + "])";
            }
        }
        return res + rest;
    }
    return res + str.substring(start);
}
