// Copyright (c) 2006-2009 by Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/** @scope modules */

const Template = Module("template", {
    add: function add(a, b) a + b,
    join: function join(c) function (a, b) a + c + b,

    map: function map(iter, func, sep, interruptable) {
        return this.map2(xml, iter, func, sep, interruptable);
    },
    map2: function map(tag, iter, func, sep, interruptable) {
        if (iter.length) // FIXME: Kludge?
            iter = util.Array.itervalues(iter);
        let ret = tag``;
        let n = 0;
        var op = tag["+="] || tag["+"] ||function (lhs, rhs) tag`${lhs}${rhs}`;
        for (let i of Iterator(iter)) {
            let val = func(i);
            if (val == undefined || (tag.isEmpty && tag.isEmpty(val)))
                continue;
            if (sep && n++)
                ret = op(ret, sep);
            if (interruptable && n % interruptable == 0)
                liberator.threadYield(true, true);
            ret = op(ret, val);
        }
        return ret;
    },

    maybeXML: function maybeXML(val) {
        if (val instanceof TemplateSupportsXML)
            return val;

        try {
            return xml.raw`${val}`;
        }
        catch (e) {}
        return xml`${val}`;
    },

    completionRow: function completionRow(item, highlightGroup) {
        if (typeof icon == "function")
            icon = icon();

        if (highlightGroup) {
            var text = item[0] || "";
            var desc = item[1] || "";
        }
        else {
            var text = this.process[0].call(this, item, item.text);
            var desc = this.process[1].call(this, item, item.description);
        }

        return xml`<div highlight=${highlightGroup || "CompItem"} style="white-space: nowrap">
                   <!-- The non-breaking spaces prevent empty elements
                      - from pushing the baseline down and enlarging
                      - the row.
                      -->
                   <li highlight="CompResult">${text}&#160;</li>
                   <li highlight="CompDesc">${desc}&#160;</li>
               </div>`;
    },

    bookmarkDescription: function (item, text, filter)
    xml`
        <a href=${item.item.url} highlight="URL">${template.highlightFilter(text || "", filter)}</a>&#160;
        ${
            !(item.extra && item.extra.length) ? "" :
            xml`<span class="extra-info">
                (${
                    template.map2(xml, item.extra,
                    function (e) xml`${e[0]}: <span highlight=${e[2]}>${e[1]}</span>`,
                    xml.cdata`&#xa0;`/* Non-breaking space */)
                })
            </span>`
        }
    `,

    icon: function (item, text) {
        return xml`<span highlight="CompIcon">${item.icon ? xml`<img src=${item.icon}/>` : ""}</span><span class="td-strut"/>${text}`;
    },

    filter: function (str) xml`<span highlight="Filter">${str}</span>`,

    // if "processStrings" is true, any passed strings will be surrounded by " and
    // any line breaks are displayed as \n
    highlight: function highlight(arg, processStrings, clip) {
        // some objects like window.JSON or getBrowsers()._browsers need the try/catch
        try {
            let str = clip ? util.clip(String(arg), clip) : String(arg);
            switch (arg == null ? "undefined" : typeof arg) {
            case "number":
                return xml`<span highlight="Number">${str}</span>`;
            case "string":
                if (processStrings)
                    str = JSON.stringify(str);
                return xml`<span highlight="String">${str}</span>`;
            case "boolean":
                return xml`<span highlight="Boolean">${str}</span>`;
            case "function":
                // Vim generally doesn't like /foo*/, because */ looks like a comment terminator.
                // Using /foo*(:?)/ instead.
                if (processStrings)
                    return xml`<span highlight="Function">${str.replace(/\{(.|\n)*(?:)/g, "{ ... }")}</span>`;
                return xml`${arg}`;
            case "undefined":
                return xml`<span highlight="Null">${arg}</span>`;
            case "object":
                if (arg instanceof TemplateSupportsXML)
                    return arg;
                // for java packages value.toString() would crash so badly
                // that we cannot even try/catch it
                if (/^\[JavaPackage.*\]$/.test(arg))
                    return xml`[JavaPackage]`;
                if (processStrings && false)
                    str = template.highlightFilter(str, "\n", function () xml`<span highlight="NonText">^J</span>`);
                return xml`<span highlight="Object">${str}</span>`;
            default:
                return `<unknown type>`;
            }
        }
        catch (e) {
            return `<unknown>`;
        }
    },

    highlightFilter: function highlightFilter(str, filter, highlight) {
        if (filter.length == 0)
            return str;

        let filterArr = filter.split(" ");
        let matchArr = [];
        for (let item of filterArr) {
            if (!item)
                continue;
            let lcstr = String.toLowerCase(str);
            let lcfilter = item.toLowerCase();
            let start = 0;
            while ((start = lcstr.indexOf(lcfilter, start)) > -1) {
                matchArr.push({pos:start, len:lcfilter.length});
                start += lcfilter.length;
            }
        }

        return this.highlightSubstrings(str, matchArr, highlight || template.filter);
    },

    highlightRegexp: function highlightRegexp(str, re, highlight) {
        let matchArr = [];
        let res;
        while ((res = re.exec(str)) && res[0].length)
            matchArr.push({pos:res.index, len:res[0].length});

        return this.highlightSubstrings(str, matchArr, highlight || template.filter);
    },

    removeOverlapMatch: function removeOverlapMatch(matchArr) {
        matchArr.sort(function(a,b) a.pos - b.pos || b.len - a.len); // Ascending start positions
        let resArr = [];
        let offset = -1;
        let last, prev;
        for (let item of matchArr) {
            last = item.pos + item.len;
            if (item.pos > offset) {
                prev = resArr[resArr.length] = item;
                offset = last;
            } else if (last > offset) {
                prev.len += (last - offset);
                offset = last;
            }
        }

        return resArr;
    },

    highlightSubstrings: function highlightSubstrings(str, iter, highlight) {
        if (str instanceof TemplateSupportsXML)
            return str;
        if (str == "")
            return xml`${str}`;

        str = String(str).replace(" ", "\u00a0");
        let s = xml``;
        var add = xml["+="];
        let start = 0;
        let n = 0;
        for (let item of this.removeOverlapMatch(iter)) {
            if (n++ > 50) // Prevent infinite loops.
                return add(s, xml`${str.substr(start)}`);
            add(s, xml`${str.substring(start, item.pos)}`);
            add(s, highlight(str.substr(item.pos, item.len)));
            start = item.pos + item.len;
        }
        return add(s, xml`${str.substr(start)}`);
    },

    highlightURL: function highlightURL(str, force, highlight) {
        highlight = "URL" + (highlight ? " " + highlight : "");
        if (force || /^[a-zA-Z]+:\/\//.test(str))
            return xml`<a highlight=${highlight} href=${str}>${str}</a>`;
        else
            return str;
    },

    // A generic output function which can have an (optional)
    // title and the output can be an XML which is just passed on
    genericOutput: function generic(title, value) {
        if (title)
            return xml`<table style="width: 100%">
                       <tr style="text-align: left;" highlight="CompTitle">
                           <th>${title}</th>
                       </tr>
                       </table>
                       <div style="padding-left: 0.5ex; padding-right: 0.5ex">${value}</div>
                   `;
        else
            return xml`${value}`;
    },

    // every item must have a .xml property which defines how to draw itself
    // @param headers is an array of strings, the text for the header columns
    genericTable: function genericTable(items, format) {
        completion.listCompleter(function (context) {
            context.filterFunc = null;
            if (format)
                context.format = format;
            context.completions = items;
        });
    },

    options: function options(title, opts) {
        return this.genericOutput("",
            xml`<table style="width: 100%">
                <tr highlight="CompTitle" align="left">
                    <th>${title}</th>
                </tr>
                ${
                    this.map2(xml, opts, function (opt) xml`
                    <tr>
                        <td>
                            <span style=${opt.isDefault ? "" : "font-weight: bold"}>${opt.pre}${opt.name}</span><span>${opt.value}</span>
                            ${opt.isDefault || opt.default == null ? "" : xml`<span class="extra-info"> (default: ${opt.default})</span>`}
                        </td>
                    </tr>`)
                }
            </table>`);
    },

    // only used by showPageInfo: look for some refactoring
    table: function table(title, data, indent) {
        return this.table2(xml, title, data, indent);
    },
    table2: function table2(tag, title, data, indent) {
        var body = this.map2(tag, data, function (datum) tag`
                    <tr>
                       <td style=${"font-weight: bold; min-width: 150px; padding-left: " + (indent || "2ex")}>${datum[0]}</td>
                       <td>${template.maybeXML(datum[1])}</td>
                    </tr>`);
        let table =
            tag`<table>
                <tr highlight="Title" align="left">
                    <th colspan="2">${title}</th>
                </tr>
                ${body}
            </table>`;
        return body ? table : tag``;
    },

    // This is a generic function which can display tabular data in a nice way.
    // @param {string|array(string|object)} columns: Can either be:
    //        a) A string which is the only column header, stretching the whole width
    //        b) An array of strings: Each string is the header of a column
    //        c) An array of objects: An object has optional properties "header", "style"
    //           and "highlight" which define the columns appearance
    // @param {object} rows: The rows as an array or arrays (or other iterable objects)
    tabular: function tabular(columns, rows) {
        function createHeadings() {
            if (typeof(columns) == "string")
                return xml`<th colspan=${(rows && rows[0].length) || 1}>${columns}</th>`;

            let colspan = 1;
            return template.map(columns, function (h) {
                if (colspan > 1) {
                    colspan--;
                    return xml``;
                }

                if (typeof(h) == "string")
                    return xml`<th>${h}</th>`;

                let header = h.header || "";
                colspan = h.colspan || 1;
                return xml`<th colspan=${colspan}>${header}</th>`;
            });
        }

        function createRow(row) {
            return template.map(Iterator(row), function ([i, d]) {
                let style = ((columns && columns[i] && columns[i].style) || "") + (i == (row.length - 1) ? "; width: 100%" : ""); // the last column should take the available space -> width: 100%
                let highlight = (columns && columns[i] && columns[i].highlight) || "";
                return xml`<td style=${style} highlight=${highlight}>${template.maybeXML(d)}</td>`;
            });
        }

        return  xml`<table style="width: 100%">
                    <tr highlight="CompTitle" align="left">
                    ${
                        createHeadings()
                    }
                    </tr>
                    ${
                        this.map2(xml, rows, function (row)
                        xml`<tr highlight="CompItem">
                        ${
                            createRow(row)
                        }
                        </tr>`)
                    }
                </table>`;
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
