/***** BEGIN LICENSE BLOCK ***** {{{
Version: MPL 1.1/GPL 2.0/LGPL 2.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
    Code based on venkman

Alternatively, the contents of this file may be used under the terms of
either the GNU General Public License Version 2 or later (the "GPL"), or
the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
in which case the provisions of the GPL or the LGPL are applicable instead
of those above. If you wish to allow use of your version of this file only
under the terms of either the GPL or the LGPL, and not to allow others to
use your version of this file under the terms of the MPL, indicate your
decision by deleting the provisions above and replace them with the notice
and other provisions required by the GPL or the LGPL. If you do not delete
the provisions above, a recipient may use your version of this file under
the terms of any one of the MPL, the GPL or the LGPL.
}}} ***** END LICENSE BLOCK *****/

/** @scope modules */

plugins.contexts = {};
function Script(file)
{
    let self = plugins.contexts[file.path];
    if (self)
    {
        if (self.onUnload)
            self.onUnload();
        return self;
    }
    plugins.contexts[file.path] = this;
    this.NAME = file.leafName.replace(/\..*/, "").replace(/-([a-z])/g, function (m, n1) n1.toUpperCase());
    this.PATH = file.path;
    this.__context__ = this;

    // This belongs elsewhere
    for (let [, dir] in Iterator(io.getRuntimeDirectories("plugin")))
    {
        if (dir.contains(file, false))
            plugins[this.NAME] = this;
    }
}
Script.prototype = plugins;

// TODO: why are we passing around strings rather than file objects?
/**
 * Provides a basic interface to common system I/O operations.
 * @instance io
 */
function IO() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const WINDOWS = liberator.has("Win32");
    const EXTENSION_NAME = config.name.toLowerCase();

    const downloadManager = Cc["@mozilla.org/download-manager;1"].createInstance(Ci.nsIDownloadManager);

    var processDir = services.get("directory").get("CurWorkD", Ci.nsIFile);
    var cwd = processDir;
    var oldcwd = null;

    var lastRunCommand = ""; // updated whenever the users runs a command with :!
    var scriptNames = [];

    // default option values
    var cdpath = "," + (services.get("environment").get("CDPATH").replace(/[:;]/g, ",") || ",");
    var shell, shellcmdflag;

    if (WINDOWS)
    {
        shell = "cmd.exe";
        // TODO: setting 'shell' to "something containing sh" updates
        // 'shellcmdflag' appropriately at startup on Windows in Vim
        shellcmdflag = "/c";
    }
    else
    {
        shell = services.get("environment").get("SHELL") || "sh";
        shellcmdflag = "-c";
    }

    function expandPathList(list) list.split(",").map(io.expandPath).join(",")

    function getPathsFromPathList(list)
    {
        if (!list)
            return [];
        else
            // empty list item means the current directory
            return list.replace(/,$/, "").split(",")
                       .map(function (dir) dir == "" ? io.getCurrentDirectory().path : dir);
    }

    function replacePathSep(path) path.replace("/", IO.PATH_SEP, "g");

    function joinPaths(head, tail)
    {
        let path = self.getFile(head);
        try
        {
            path.appendRelativePath(self.expandPath(tail, true)); // FIXME: should only expand env vars and normalise path separators
            // TODO: This code breaks the external editor at least in ubuntu
            // because /usr/bin/gvim becomes /usr/bin/vim.gnome normalized and for
            // some strange reason it will start without a gui then (which is not
            // optimal if you don't start firefox from a terminal ;)
            // Why do we need this code?
            // if (path.exists() && path.normalize)
            //    path.normalize();
        }
        catch (e)
        {
            return { exists: function () false, __noSuchMethod__: function () { throw e; } };
        }
        return path;
    }

    function isAbsolutePath(path)
    {
        try
        {
            services.create("file").initWithPath(path);
            return true;
        }
        catch (e)
        {
            return false;
        }
    }

    var downloadListener = {
        onDownloadStateChange: function (state, download)
        {
            if (download.state == downloadManager.DOWNLOAD_FINISHED)
            {
                let url   = download.source.spec;
                let title = download.displayName;
                let file  = download.targetFile.path;
                let size  = download.size;

                liberator.echomsg("Download of " + title + " to " + file + " finished", 1);
                autocommands.trigger("DownloadPost", { url: url, title: title, file: file, size: size });
            }
        },
        onStateChange:    function () {},
        onProgressChange: function () {},
        onSecurityChange: function () {}
    };

    downloadManager.addListener(downloadListener);
    liberator.registerObserver("shutdown", function () {
        downloadManager.removeListener(downloadListener);
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["fileencoding", "fenc"],
        "Sets the character encoding of read and written files",
        "string", "UTF-8",
        {
            completer: function (context) completion.charset(context),
            validator: Option.validateCompleter
        });
    options.add(["cdpath", "cd"],
        "List of directories searched when executing :cd",
        "stringlist", cdpath,
        { setter: function (value) expandPathList(value) });

    options.add(["runtimepath", "rtp"],
        "List of directories searched for runtime files",
        "stringlist", IO.runtimePath,
        { setter: function (value) expandPathList(value) });

    options.add(["shell", "sh"],
        "Shell to use for executing :! and :run commands",
        "string", shell,
        { setter: function (value) io.expandPath(value) });

    options.add(["shellcmdflag", "shcf"],
        "Flag passed to shell when executing :! and :run commands",
        "string", shellcmdflag);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["cd", "chd[ir]"],
        "Change the current directory",
        function (args)
        {
            let arg = args.literalArg;

            if (!arg)
                arg = "~";
            else if (arg == "-")
            {
                if (oldcwd)
                    arg = oldcwd.path;
                else
                    return void liberator.echoerr("E186: No previous directory");
            }

            arg = io.expandPath(arg);

            // go directly to an absolute path or look for a relative path
            // match in 'cdpath'
            // TODO: handle ../ and ./ paths
            if (isAbsolutePath(arg))
            {
                if (io.setCurrentDirectory(arg))
                    liberator.echomsg(io.getCurrentDirectory().path);
            }
            else
            {
                let dirs = getPathsFromPathList(options["cdpath"]);
                let found = false;

                for (let [, dir] in Iterator(dirs))
                {
                    dir = joinPaths(dir, arg);

                    if (dir.exists() && dir.isDirectory() && dir.isReadable())
                    {
                        io.setCurrentDirectory(dir.path);
                        liberator.echomsg(io.getCurrentDirectory().path);
                        found = true;
                        break;
                    }
                }

                if (!found)
                {
                    liberator.echoerr("E344: Can't find directory \"" + arg + "\" in cdpath\n"
                                    + "E472: Command failed");
                }
            }
        },
        {
            argCount: "?",
            completer: function (context) completion.directory(context, true),
            literal: 0
        });

    // NOTE: this command is only used in :source
    commands.add(["fini[sh]"],
        "Stop sourcing a script file",
        function () { liberator.echoerr("E168: :finish used outside of a sourced file"); },
        { argCount: "0" });

    commands.add(["pw[d]"],
        "Print the current directory name",
        function () { liberator.echomsg(io.getCurrentDirectory().path); },
        { argCount: "0" });

    // "mkv[imperatorrc]" or "mkm[uttatorrc]"
    commands.add([EXTENSION_NAME.replace(/(.)(.*)/, "mk$1[$2rc]")],
        "Write current key mappings and changed options to the config file",
        function (args)
        {
            if (args.length > 1)
                return void liberator.echoerr("E172: Only one file name allowed");

            let filename = args[0] || io.getRCFile(null, true).path;
            let file = io.getFile(filename);

            if (file.exists() && !args.bang)
                return void liberator.echoerr("E189: \"" + filename + "\" exists (add ! to override)");

            // TODO: Use a set/specifiable list here:
            let lines = [cmd.serial().map(commands.commandToString) for (cmd in commands) if (cmd.serial)];
            lines = util.Array.flatten(lines);

            // source a user .vimperatorrc file
            lines.unshift('"' + liberator.version + "\n");

            // For the record, I think that adding this line is absurd. --Kris
            // I can't disagree. --djk
            lines.push(commands.commandToString({
                command: "source",
                bang: true,
                arguments: [filename + ".local"]
            }));

            lines.push("\n\" vim: set ft=" + EXTENSION_NAME + ":");

            try
            {
                io.writeFile(file, lines.join("\n"));
            }
            catch (e)
            {
                liberator.echoerr("E190: Cannot open \"" + filename + "\" for writing");
                liberator.log("Could not write to " + file.path + ": " + e.message); // XXX
            }
        },
        {
            argCount: "*", // FIXME: should be "?" but kludged for proper error message
            bang: true,
            completer: function (context) completion.file(context, true)
        });

    commands.add(["runt[ime]"],
        "Source the specified file from each directory in 'runtimepath'",
        function (args) { io.sourceFromRuntimePath(args, args.bang); },
        {
            argCount: "+",
            bang: true
        }
    );

    commands.add(["scrip[tnames]"],
        "List all sourced script names",
        function ()
        {
            let list = template.tabular(["<SNR>", "Filename"], ["text-align: right; padding-right: 1em;"],
                ([i + 1, file] for ([i, file] in Iterator(scriptNames))));  // TODO: add colon and remove column titles for pedantic Vim compatibility?

            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },
        { argCount: "0" });

    commands.add(["so[urce]"],
        "Read Ex commands from a file",
        function (args)
        {
            if (args.length > 1)
                liberator.echoerr("E172: Only one file name allowed");
            else
                io.source(args[0], args.bang);
        },
        {
            argCount: "+", // FIXME: should be "1" but kludged for proper error message
            bang: true,
            completer: function (context) completion.file(context, true)
        });

    commands.add(["!", "run"],
        "Run a command",
        function (args)
        {
            let arg = args.literalArg;

            // :!! needs to be treated specially as the command parser sets the
            // bang flag but removes the ! from arg
            if (args.bang)
                arg = "!" + arg;

            // replaceable bang and no previous command?
            if (/((^|[^\\])(\\\\)*)!/.test(arg) && !lastRunCommand)
                return void liberator.echoerr("E34: No previous command");

            // NOTE: Vim doesn't replace ! preceded by 2 or more backslashes and documents it - desirable?
            // pass through a raw bang when escaped or substitute the last command
            arg = arg.replace(/(\\)*!/g,
                function (m) /^\\(\\\\)*!$/.test(m) ? m.replace("\\!", "!") : m.replace("!", lastRunCommand)
            );

            lastRunCommand = arg;

            let output = io.system(arg);

            commandline.echo(template.commandOutput(<span highlight="CmdOutput">{output}</span>));

            autocommands.trigger("ShellCmdPost", {});
        },
        {
            argCount: "?", // TODO: "1" - probably not worth supporting weird Vim edge cases. The dream is dead. --djk
            bang: true,
            completer: function (context) completion.shellCommand(context),
            literal: 0
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMPLETIONS /////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_completion", function () {
        completion.setFunctionCompleter([self.getFile, self.expandPath],
            [function (context, obj, args) {
                context.quote[2] = "";
                completion.file(context, true);
            }]);

        completion.charset = function (context) {
            context.anchored = false;
            context.generate = function () {
                let names = util.Array(
                    "more1 more2 more3 more4 more5 unicode".split(" ").map(function (key)
                        options.getPref("intl.charsetmenu.browser." + key).split(', '))
                ).flatten().uniq();
                let bundle = document.getElementById("liberator-charset-bundle");
                return names.map(function (name) [name, bundle.getString(name.toLowerCase() + ".title")]);
            };
        };

        completion.directory = function directory(context, full) {
            this.file(context, full);
            context.filters.push(function ({ item: f }) f.isDirectory());
        };

        completion.environment = function environment(context) {
            let command = liberator.has("Win32") ? "set" : "env";
            let lines = io.system(command).split("\n");
            lines.pop();

            context.title = ["Environment Variable", "Value"];
            context.generate = function () lines.map(function (line) (line.match(/([^=]+)=(.+)/) || []).slice(1));
        };

        // TODO: support file:// and \ or / path separators on both platforms
        // if "tail" is true, only return names without any directory components
        completion.file = function file(context, full) {
            // dir == "" is expanded inside readDirectory to the current dir
            let [dir] = context.filter.match(/^(?:.*[\/\\])?/);

            if (!full)
                context.advance(dir.length);

            context.title = [full ? "Path" : "Filename", "Type"];
            context.keys = {
                text: !full ? "leafName" : function (f) dir + f.leafName,
                description: function (f) f.isDirectory() ? "Directory" : "File",
                isdir: function (f) f.isDirectory(),
                icon: function (f) f.isDirectory() ? "resource://gre/res/html/folder.png"
                                                             : "moz-icon://" + f.leafName
            };
            context.compare = function (a, b)
                        b.isdir - a.isdir || String.localeCompare(a.text, b.text);

            if (options["wildignore"])
            {
                let wigRegexp = RegExp("(^" + options.get("wildignore").values.join("|") + ")$");
                context.filters.push(function ({item: f}) f.isDirectory() || !wigRegexp.test(f.leafName));
            }

            // context.background = true;
            context.key = dir;
            context.generate = function generate_file()
            {
                try
                {
                    return io.readDirectory(dir);
                }
                catch (e) {}
            };
        };

        completion.shellCommand = function shellCommand(context) {
            context.title = ["Shell Command", "Path"];
            context.generate = function ()
            {
                let dirNames = services.get("environment").get("PATH").split(RegExp(liberator.has("Win32") ? ";" : ":"));
                let commands = [];

                for (let [, dirName] in Iterator(dirNames))
                {
                    let dir = io.getFile(dirName);
                    if (dir.exists() && dir.isDirectory())
                    {
                        commands.push([[file.leafName, dir.path] for ([i, file] in Iterator(io.readDirectory(dir)))
                                            if (file.isFile() && file.isExecutable())]);
                    }
                }

                return util.Array.flatten(commands);
            };
        };

        completion.addUrlCompleter("f", "Local files", completion.file);
    });


    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const self = {

        /**
         * @property {number} Open for reading only.
         * @final
         */
        MODE_RDONLY: 0x01,

        /**
         * @property {number} Open for writing only.
         * @final
         */
        MODE_WRONLY: 0x02,

        /**
         * @property {number} Open for reading and writing.
         * @final
         */
        MODE_RDWR: 0x04,

        /**
         * @property {number} If the file does not exist, the file is created.
         *     If the file exists, this flag has no effect.
         * @final
         */
        MODE_CREATE: 0x08,

        /**
         * @property {number} The file pointer is set to the end of the file
         *     prior to each write.
         * @final
         */
        MODE_APPEND: 0x10,

        /**
         * @property {number} If the file exists, its length is truncated to 0.
         * @final
         */
        MODE_TRUNCATE: 0x20,

        /**
         * @property {number} If set, each write will wait for both the file
         *     data and file status to be physically updated.
         * @final
         */
        MODE_SYNC: 0x40,

        /**
         * @property {number} With MODE_CREATE, if the file does not exist, the
         *     file is created. If the file already exists, no action and NULL
         *     is returned.
         * @final
         */
        MODE_EXCL: 0x80,

        /**
         * @property {Object} The current file sourcing context. As a file is
         *     being sourced the 'file' and 'line' properties of this context
         *     object are updated appropriately.
         */
        sourcing: null,

        /**
         * Expands "~" and environment variables in <b>path</b>.
         *
         * "~" is expanded to to the value of $HOME. On Windows if this is not
         * set then the following are tried in order:
         *   $USERPROFILE
         *   ${HOMDRIVE}$HOMEPATH
         *
         * The variable notation is $VAR (terminated by a non-word character)
         * or ${VAR}. %VAR% is also supported on Windows.
         *
         * @param {string} path The unexpanded path string.
         * @param {boolean} relative Whether the path is relative or absolute.
         * @returns {string}
         */
        expandPath: IO.expandPath,

        // TODO: there seems to be no way, short of a new component, to change
        // the process's CWD - see https://bugzilla.mozilla.org/show_bug.cgi?id=280953
        /**
         * Returns the current working directory.
         *
         * It's not possible to change the real CWD of the process so this
         * state is maintained internally. External commands run via
         * {@link #system} are executed in this directory.
         *
         * @returns {nsIFile}
         */
        getCurrentDirectory: function ()
        {
            let dir = self.getFile(cwd.path);

            // NOTE: the directory could have been deleted underneath us so
            // fallback to the process's CWD
            if (dir.exists() && dir.isDirectory())
                return dir;
            else
                return processDir;
        },

        /**
         * Sets the current working directory.
         *
         * @param {string} newDir The new CWD. This may be a relative or
         *     absolute path and is expanded by {@link #expandPath}.
         */
        setCurrentDirectory: function (newDir)
        {
            newDir = newDir || "~";

            if (newDir == "-")
                [cwd, oldcwd] = [oldcwd, this.getCurrentDirectory()];
            else
            {
                let dir = self.getFile(newDir);

                if (!dir.exists() || !dir.isDirectory())
                {
                    liberator.echoerr("E344: Can't find directory \"" + dir.path + "\" in path");
                    return null;
                }

                [cwd, oldcwd] = [dir, this.getCurrentDirectory()];
            }

            return self.getCurrentDirectory();
        },

        /**
         * Returns all directories named <b>name<b/> in 'runtimepath'.
         *
         * @param {string} name
         * @returns {nsIFile[])
         */
        getRuntimeDirectories: function (name)
        {
            let dirs = getPathsFromPathList(options["runtimepath"]);

            dirs = dirs.map(function (dir) joinPaths(dir, name))
                       .filter(function (dir) dir.exists() && dir.isDirectory() && dir.isReadable());

            return dirs;
        },

        /**
         * Returns the first user RC file found in <b>dir</b>.
         *
         * @param {string} dir The directory to search.
         * @param {boolean} always When true, return a path whether
         *     the file exists or not.
         * @default $HOME.
         * @returns {nsIFile} The RC file or null if none is found.
         */
        getRCFile: function (dir, always)
        {
            dir = dir || "~";

            let rcFile1 = joinPaths(dir, "." + EXTENSION_NAME + "rc");
            let rcFile2 = joinPaths(dir, "_" + EXTENSION_NAME + "rc");

            if (WINDOWS)
                [rcFile1, rcFile2] = [rcFile2, rcFile1];

            if (rcFile1.exists() && rcFile1.isFile())
                return rcFile1;
            else if (rcFile2.exists() && rcFile2.isFile())
                return rcFile2;
            else if (always)
                return rcFile1;
            return null;
        },

        // return a nsILocalFile for path where you can call isDirectory(), etc. on
        // caller must check with .exists() if the returned file really exists
        // also expands relative paths
        /**
         * Returns an nsIFile object for <b>path</b>, which is expanded
         * according to {@link #expandPath}.
         *
         * @param {string} path The path used to create the file object.
         * @param {boolean} noCheckPWD Whether to allow a relative path.
         * @returns {nsIFile}
         */
        getFile: function (path, noCheckPWD)
        {
            let file = services.create("file");

            if (/file:\/\//.test(path))
            {
                file = Cc["@mozilla.org/network/protocol;1?name=file"].createInstance(Ci.nsIFileProtocolHandler)
                                 .getFileFromURLSpec(path);
            }
            else
            {
                let expandedPath = self.expandPath(path);

                if (!isAbsolutePath(expandedPath) && !noCheckPWD)
                    file = joinPaths(self.getCurrentDirectory().path, expandedPath);
                else
                    file.initWithPath(expandedPath);
            }

            return file;
        },

        // TODO: make secure
        /**
         * Creates a temporary file.
         *
         * @returns {nsIFile}
         */
        createTempFile: function ()
        {
            let file = services.get("directory").get("TmpD", Ci.nsIFile);

            file.append(config.tempFile);
            file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);

            return file;
        },

        /**
         * Returns the list of files in <b>dir</b>.
         *
         * @param {nsIFile|string} dir The directory to read, either a full
         *     pathname or an instance of nsIFile.
         * @param {boolean} sort Whether to sort the returned directory
         *     entries.
         * @returns {nsIFile[]}
         */
        readDirectory: function (dir, sort)
        {
            if (typeof dir == "string")
                dir = self.getFile(dir);
            else if (!(dir instanceof Ci.nsILocalFile))
                throw Cr.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            if (dir.isDirectory())
            {
                let entries = dir.directoryEntries;
                let array = [];
                while (entries.hasMoreElements())
                {
                    let entry = entries.getNext();
                    array.push(entry.QueryInterface(Ci.nsIFile));
                }
                if (sort)
                    array.sort(function (a, b) b.isDirectory() - a.isDirectory() ||  String.localeCompare(a.path, b.path));
                return array;
            }
            else
                return []; // XXX: or should it throw an error, probably yes?
                           //  Yes, though frankly this should be a precondition so... --djk
        },

        /**
         * Reads a file in "text" mode and returns the content as a string.
         *
         * @param {nsIFile|string} file The file to read, either a full
         *     pathname or an instance of nsIFile.
         * @returns {string}
         */
        readFile: function (file, encoding)
        {
            let ifstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
            let icstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);

            if (!encoding)
                encoding = options["fileencoding"];
            if (typeof file == "string")
                file = self.getFile(file);
            else if (!(file instanceof Ci.nsILocalFile))
                throw Cr.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined
                // How would you expect it to work? It's an integer. --Kris

            ifstream.init(file, -1, 0, 0);
            icstream.init(ifstream, encoding, 4096, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER); // 4096 bytes buffering

            let buffer = "";
            let str = {};
            while (icstream.readString(4096, str) != 0)
                buffer += str.value;

            icstream.close();
            ifstream.close();

            return buffer;
        },

        /**
         * Writes the string <b>buf</b> to a file.
         *
         * @param {nsIFile|string} file The file to write, either a full
         *     pathname or an instance of nsIFile.
         * @param {string} buf The file content.
         * @param {string|number} mode The file access mode, a bitwise OR of
         *     the following flags:
         *       {@link #MODE_RDONLY}:   0x01
         *       {@link #MODE_WRONLY}:   0x02
         *       {@link #MODE_RDWR}:     0x04
         *       {@link #MODE_CREATE}:   0x08
         *       {@link #MODE_APPEND}:   0x10
         *       {@link #MODE_TRUNCATE}: 0x20
         *       {@link #MODE_SYNC}:     0x40
         *     Alternatively, the following abbreviations may be used:
         *       ">"  is equivalent to {@link #MODE_WRONLY} | {@link #MODE_CREATE} | {@link #MODE_TRUNCATE}
         *       ">>" is equivalent to {@link #MODE_WRONLY} | {@link #MODE_CREATE} | {@link #MODE_APPEND}
         * @default ">"
         * @param {number} perms The file mode bits of the created file. This
         *     is only used when creating a new file and does not change
         *     permissions if the file exists.
         * @default 0644
         */
        writeFile: function (file, buf, mode, perms, encoding)
        {
            let ofstream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
            function getStream(defaultChar)
            {
                let stream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
                stream.init(ofstream, encoding, 0, defaultChar);
                return stream;
            }

            if (!encoding)
                encoding = options["fileencoding"];
            if (typeof file == "string")
                file = self.getFile(file);
            else if (!(file instanceof Ci.nsILocalFile))
                throw Cr.NS_ERROR_INVALID_ARG; // FIXME: does not work as expected, just shows undefined: undefined

            if (mode == ">>")
                mode = self.MODE_WRONLY | self.MODE_CREATE | self.MODE_APPEND;
            else if (!mode || mode == ">")
                mode = self.MODE_WRONLY | self.MODE_CREATE | self.MODE_TRUNCATE;

            if (!perms)
                perms = 0644;

            ofstream.init(file, mode, perms, 0);
            let ocstream = getStream(0);
            try
            {
                ocstream.writeString(buf);
            }
            catch (e)
            {
                liberator.dump(e);
                if (e.result == Cr.NS_ERROR_LOSS_OF_SIGNIFICANT_DATA)
                {
                    ocstream = getStream("?".charCodeAt(0));
                    ocstream.writeString(buf);
                    return false;
                }
                else
                    throw e;
            }
            finally
            {
                try
                {
                    ocstream.close();
                }
                catch (e) {}
                ofstream.close();
            }
            return true;
        },

        /**
         * Runs an external program.
         *
         * @param {string} program The program to run.
         * @param {string[]} args An array of arguments to pass to <b>program</b>.
         * @param {boolean} blocking Whether to wait until the process terminates.
         */
        blockingProcesses: [],
        run: function (program, args, blocking)
        {
            args = args || [];
            blocking = !!blocking;

            let file;

            if (isAbsolutePath(program))
                file = self.getFile(program, true);
            else
            {
                let dirs = services.get("environment").get("PATH").split(WINDOWS ? ";" : ":");
                // Windows tries the CWD first TODO: desirable?
                if (WINDOWS)
                    dirs = [io.getCurrentDirectory().path].concat(dirs);

lookup:
                for (let [, dir] in Iterator(dirs))
                {
                    file = joinPaths(dir, program);
                    try
                    {
                        if (file.exists())
                            break;

                        // TODO: couldn't we just palm this off to the start command?
                        // automatically try to add the executable path extensions on windows
                        if (WINDOWS)
                        {
                            let extensions = services.get("environment").get("PATHEXT").split(";");
                            for (let [, extension] in Iterator(extensions))
                            {
                                file = joinPaths(dir, program + extension);
                                if (file.exists())
                                    break lookup;
                            }
                        }
                    }
                    catch (e) {}
                }
            }

            if (!file || !file.exists())
            {
                liberator.echoerr("Command not found: " + program);
                return -1;
            }

            let process = services.create("process");

            process.init(file);
            process.run(blocking, args.map(String), args.length);

            return process.exitValue;
        },

        // FIXME: multiple paths?
        /**
         * Sources files found in 'runtimepath'. For each relative path in
         * <b>paths</b> each directory in 'runtimepath' is searched and if a
         * matching file is found it is sourced. Only the first file found (per
         * specified path) is sourced unless <b>all</b> is specified, then
         * all found files are sourced.
         *
         * @param {string[]} paths An array of relative paths to source.
         * @param {boolean} all Whether all found files should be sourced.
         */
        sourceFromRuntimePath: function (paths, all)
        {
            let dirs = getPathsFromPathList(options["runtimepath"]);
            let found = false;

            liberator.echomsg("Searching for \"" + paths.join(" ") + "\" in \"" + options["runtimepath"] + "\"", 2);

            outer:
            for (let [, dir] in Iterator(dirs))
            {
                for (let [, path] in Iterator(paths))
                {
                    let file = joinPaths(dir, path);

                    liberator.echomsg("Searching for \"" + file.path + "\"", 3);

                    if (file.exists() && file.isFile() && file.isReadable())
                    {
                        io.source(file.path, false);
                        found = true;

                        if (!all)
                            break outer;
                    }
                }
            }

            if (!found)
                liberator.echomsg("not found in 'runtimepath': \"" + paths.join(" ") + "\"", 1);

            return found;
        },

        /**
         * Reads Ex commands, JavaScript or CSS from <b>filename</b>.
         *
         * @param {string} filename The name of the file to source.
         * @param {boolean} silent Whether errors should be reported.
         */
        source: function (filename, silent)
        {
            let wasSourcing = self.sourcing;
            try
            {
                var file = self.getFile(filename);
                self.sourcing = {
                    file: file.path,
                    line: 0
                };

                if (!file.exists() || !file.isReadable() || file.isDirectory())
                {
                    if (!silent)
                    {
                        if (file.exists() && file.isDirectory())
                            liberator.echomsg("Cannot source a directory: \"" + filename + "\"", 0);
                        else
                            liberator.echomsg("could not source: \"" + filename + "\"", 1);

                        liberator.echoerr("E484: Can't open file " + filename);
                    }

                    return;
                }

                liberator.echomsg("sourcing \"" + filename + "\"", 2);

                let str = self.readFile(file);
                let uri = services.get("io").newFileURI(file);

                // handle pure JavaScript files specially
                if (/\.js$/.test(filename))
                {
                    try
                    {
                        liberator.loadScript(uri.spec, new Script(file));
                    }
                    catch (e)
                    {
                        let err = new Error();
                        for (let [k, v] in Iterator(e))
                            err[k] = v;
                        err.echoerr = file.path + ":" + e.lineNumber + ": " + e;
                        throw err;
                    }
                }
                else if (/\.css$/.test(filename))
                    storage.styles.registerSheet(uri.spec, true);
                else
                {
                    let heredoc = "";
                    let heredocEnd = null; // the string which ends the heredoc
                    let lines = str.split(/\r\n|[\r\n]/);

                    function execute(args) { command.execute(args, special, count, { setFrom: file }); }

                    for (let [i, line] in Iterator(lines))
                    {
                        if (heredocEnd) // we already are in a heredoc
                        {
                            if (heredocEnd.test(line))
                            {
                                execute(heredoc);
                                heredoc = "";
                                heredocEnd = null;
                            }
                            else
                                heredoc += line + "\n";
                        }
                        else
                        {
                            self.sourcing.line = i + 1;
                            // skip line comments and blank lines
                            line = line.replace(/\r$/, "");

                            if (/^\s*(".*)?$/.test(line))
                                continue;

                            var [count, cmd, special, args] = commands.parseCommand(line);
                            var command = commands.get(cmd);

                            if (!command)
                            {
                                let lineNumber = i + 1;

                                // TODO: messages need to be able to specify
                                // whether they can be cleared/overwritten or
                                // should be appended to and the MOW opened
                                liberator.echoerr("Error detected while processing " + file.path, commandline.FORCE_MULTILINE);
                                commandline.echo("line " + lineNumber + ":", commandline.HL_LINENR, commandline.APPEND_TO_MESSAGES);
                                liberator.echoerr("E492: Not an editor command: " + line);
                            }
                            else
                            {
                                if (command.name == "finish")
                                    break;
                                else if (command.hereDoc)
                                {
                                    // check for a heredoc
                                    let matches = args.match(/(.*)<<\s*(\S+)$/);

                                    if (matches)
                                    {
                                        args = matches[1];
                                        heredocEnd = RegExp("^" + matches[2] + "$", "m");
                                        if (matches[1])
                                            heredoc = matches[1] + "\n";
                                        continue;
                                    }
                                }

                                execute(args);
                            }
                        }
                    }

                    // if no heredoc-end delimiter is found before EOF then
                    // process the heredoc anyway - Vim compatible ;-)
                    if (heredocEnd)
                        execute(heredoc);
                }

                if (scriptNames.indexOf(file.path) == -1)
                    scriptNames.push(file.path);

                liberator.echomsg("finished sourcing \"" + filename + "\"", 2);

                liberator.log("Sourced: " + filename, 3);
            }
            catch (e)
            {
                let message = "Sourcing file: " + (e.echoerr || file.path + ": " + e);
                liberator.reportError(e);
                if (!silent)
                    liberator.echoerr(message);
            }
            finally
            {
                self.sourcing = wasSourcing;
            }
        },

        // TODO: when https://bugzilla.mozilla.org/show_bug.cgi?id=68702 is
        // fixed use that instead of a tmpfile
        /**
         * Runs <b>command</b> in a subshell and returns the output in a
         * string. The shell used is that specified by the 'shell' option.
         *
         * @param {string} command The command to run.
         * @param {string} input Any input to be provided to the command on stdin.
         * @returns {string}
         */
        system: function (command, input)
        {
            liberator.echomsg("Calling shell to execute: " + command, 4);

            function escape(str) '"' + str.replace(/[\\"$]/g, "\\$&") + '"';

            return this.withTempFiles(function (stdin, stdout, cmd) {
                if (input)
                    this.writeFile(stdin, input);

                // TODO: implement 'shellredir'
                if (WINDOWS)
                {
                    command = "cd /D " + cwd.path + " && " + command + " > " + stdout.path + " 2>&1" + " < " + stdin.path;
                    var res = this.run(options["shell"], options["shellcmdflag"].split(/\s+/).concat(command), true);
                }
                else
                {
                    this.writeFile(cmd, "cd " + escape(cwd.path) + "\n" +
                            ["exec", ">" + escape(stdout.path), "2>&1", "<" + escape(stdin.path),
                             escape(options["shell"]), options["shellcmdflag"], escape(command)].join(" "));
                    res = this.run("/bin/sh", ["-e", cmd.path], true);
                }

                let output = self.readFile(stdout);
                if (res > 0)
                    output += "\nshell returned " + res;
                // if there is only one \n at the end, chop it off
                else if (output && output.indexOf("\n") == output.length - 1)
                    output = output.substr(0, output.length - 1);

                return output;
            }) || "";
        },

        /**
         * Creates a temporary file context for executing external commands.
         * <b>func</b> is called with a temp file, created with
         * {@link #createTempFile}, for each explicit argument. Ensures that
         * all files are removed when <b>func</b> returns.
         *
         * @param {function} func The function to execute.
         * @param {Object} self The 'this' object used when executing func.
         * @returns {boolean} false if temp files couldn't be created,
         *     otherwise, the return value of <b>func</b>.
         */
        withTempFiles: function (func, self)
        {
            let args = util.map(util.range(0, func.length), this.createTempFile);
            if (!args.every(util.identity))
                return false;

            try
            {
                return func.apply(self || this, args);
            }
            finally
            {
                args.forEach(function (f) f.remove(false));
            }
        }
    }; //}}}

    return self;

}; //}}}

IO.PATH_SEP = (function () {
    let f = services.get("directory").get("CurProcD", Ci.nsIFile);
    f.append("foo");
    return f.path.substr(f.parent.path.length, 1);
})();

/**
 * @property {string} The value of the $VIMPERATOR_RUNTIME environment
 *     variable.
 */
IO.__defineGetter__("runtimePath", function () {
    const rtpvar = config.name.toUpperCase() + "_RUNTIME";
    let rtp = services.get("environment").get(rtpvar);
    if (!rtp)
    {
        rtp = "~/" + (liberator.has("Win32") ? "" : ".") + config.name.toLowerCase();
        services.get("environment").set(rtpvar, rtp);
    }
    return rtp;
});

IO.expandPath = function (path, relative)
{
    // TODO: proper pathname separator translation like Vim - this should be done elsewhere
    const WINDOWS = liberator.has("Win32");

    // expand any $ENV vars - this is naive but so is Vim and we like to be compatible
    // TODO: Vim does not expand variables set to an empty string (and documents it).
    // Kris reckons we shouldn't replicate this 'bug'. --djk
    // TODO: should we be doing this for all paths?
    function expand(path) path.replace(
        !WINDOWS ? /\$(\w+)\b|\${(\w+)}/g
                 : /\$(\w+)\b|\${(\w+)}|%(\w+)%/g,
        function (m, n1, n2, n3) services.get("environment").get(n1 || n2 || n3) || m
    );
    path = expand(path);

    // expand ~
    // Yuck.
    if (!relative && RegExp("~(?:$|[/" + util.escapeRegex(IO.PATH_SEP) + "])").test(path))
    {
        // Try $HOME first, on all systems
        let home = services.get("environment").get("HOME");

        // Windows has its own idiosyncratic $HOME variables.
        if (!home && WINDOWS)
            home = services.get("environment").get("USERPROFILE") ||
                   services.get("environment").get("HOMEDRIVE") + services.get("environment").get("HOMEPATH");

        path = home + path.substr(1);
    }

    // TODO: Vim expands paths twice, once before checking for ~, once
    // after, but doesn't document it. Is this just a bug? --Kris
    path = expand(path);
    return path.replace("/", IO.PATH_SEP, "g");
};

// vim: set fdm=marker sw=4 ts=4 et:
