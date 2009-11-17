// Copyright (c) 2009 by Prathyush Thota <prathyushthota@gmail.com>
// Copyright (c) 2009 by Doug Kearns <dougkearns@gmail.com>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.


const Player = Module("player", {
    init: function init() {
        this._lastSearchString = "";
        this._lastSearchIndex = 0;
        this._lastSearchView = _SBGetCurrentView();

        // Get the focus to the visible playlist first
        //window._SBShowMainLibrary();

        gMM.addListener(this._mediaCoreListener);
    },

    destroy: function destroy() {
        gMM.removeListener(this._mediaCoreListener);
    },

    /**
     * Adjusts the track position <b>interval</b> milliseconds forwards or
     * backwards.
     *
     * @param {number} interval The time interval (ms) to move the track
     *     position.
     * @param {boolean} direction The direction in which to move the track
     *     position, forward if true otherwise backwards.
     * @private
     */
    _seek: function _seek(interval, direction) {
        let position = gMM.playbackControl ? gMM.playbackControl.position : 0;
        player.seekTo(position + (direction ? interval : -interval));
    },

    /**
     * Listens for media core events and in response dispatches the appropriate
     * autocommand events.
     * @private
     */
    _mediaCoreListener: {
        onMediacoreEvent: function (event) {
            switch (event.type) {
                case Ci.sbIMediacoreEvent.BEFORE_TRACK_CHANGE:
                    liberator.log("Before track changed: " + event.data);
                    autocommands.trigger("TrackChangePre", { track: event.data });
                    break;
                case Ci.sbIMediacoreEvent.TRACK_CHANGE:
                    autocommands.trigger("TrackChange", { track: event.data });
                    break;
                case Ci.sbIMediacoreEvent.BEFORE_VIEW_CHANGE:
                    liberator.log("Before view changed: " + event.data);
                    autocommands.trigger("ViewChangePre", { view: event.data });
                    break;
                case Ci.sbIMediacoreEvent.VIEW_CHANGE:
                    liberator.log("View changed: " + event.data);
                    autocommands.trigger("ViewChange", { view: event.data });
                    break;
                case Ci.sbIMediacoreEvent.STREAM_START:
                    liberator.log("Track started: " + gMM.sequencer.currentItem);
                    autocommands.trigger("StreamStart", { track: gMM.sequencer.currentItem });
                    break;
                case Ci.sbIMediacoreEvent.STREAM_PAUSE:
                    liberator.log("Track paused: " + gMM.sequencer.currentItem);
                    autocommands.trigger("StreamPause", { track: gMM.sequencer.currentItem });
                    break;
                case Ci.sbIMediacoreEvent.STREAM_END:
                    liberator.log("Track ended: " + gMM.sequencer.currentItem);
                    autocommands.trigger("StreamEnd", { track: gMM.sequencer.currentItem });
                    break;
                case Ci.sbIMediacoreEvent.STREAM_STOP:
                    liberator.log("Track stopped: " + gMM.sequencer.currentItem);
                    autocommands.trigger("StreamStop", { track: gMM.sequencer.currentItem });
                    break;
            }
        }
    },

    /**
     * @property {number} The player volume in the range 0.0-1.0.
     */
    get volume() gMM.volumeControl.volume,
    set volume(value) {
        gMM.volumeControl.volume = value;
    },

    /**
     * Focuses the specified media item in the current media view.
     *
     * @param {sbIMediaItem} mediaItem The media item to focus.
     */
    focusTrack: function focusTrack(mediaItem) {
        SBGetBrowser().mediaTab.mediaPage.highlightItem(_SBGetCurrentView().getIndexForItem(mediaItem));
    },

    // FIXME: can't be called from non-media tabs since 840e78 (git)
    // _SBGetCurrentView only returns the view in that tab - use SBGetBrowser().currentMediaListView
    /**
     * Plays the currently selected media item. If no item is selected the
     * first item in the current media view is played.
     */
    play: function play() {
        // Check if there is any selection in place, else play first item of the visible view.
        // TODO: this approach, or similar, should be generalised for all commands, PT? --djk
        if (_SBGetCurrentView().selection.count != 0)
            gMM.sequencer.playView(_SBGetCurrentView(),
                    _SBGetCurrentView().getIndexForItem(_SBGetCurrentView().selection.currentMediaItem));
        else
            gMM.sequencer.playView(SBGetBrowser().currentMediaListView, 0);

        this.focusTrack(gMM.sequencer.currentItem);
    },

    /**
     * Stops playback of the currently playing media item.
     */
    stop: function stop() {
        gMM.sequencer.stop();
    },

    /**
     * Plays the next media item in the current media view.
     */
    next: function next() {
        ["cmd_control_next", "cmd_find_current_track"].forEach(gSongbirdWindowController.doCommand);
    },

    /**
     * Plays the previous media item in the current media view.
     */
    previous: function previous() {
        ["cmd_control_previous", "cmd_find_current_track"].forEach(gSongbirdWindowController.doCommand);
    },

    /**
     * Toggles the play/pause status of the current media item.
     */
    togglePlayPause: function togglePlayPause() {
        ["cmd_control_playpause", "cmd_find_current_track"].forEach(gSongbirdWindowController.doCommand);
    },

    /**
     * Toggles the shuffle status of the sequencer.
     */
    toggleShuffle: function toggleShuffle() {
        if (gMM.sequencer.mode != gMM.sequencer.MODE_SHUFFLE)
            gMM.sequencer.mode = gMM.sequencer.MODE_SHUFFLE;
        else
            gMM.sequencer.mode = gMM.sequencer.MODE_FORWARD;
    },

    // FIXME: not really toggling (depending on your definition) - good enough for now.
    /**
     * Toggles between the sequencer's three repeat modes: Repeat-One,
     * Repeat-All and Repeat-None.
     */
    toggleRepeat: function toggleRepeat() {
        switch (gMM.sequencer.repeatMode) {
            case gMM.sequencer.MODE_REPEAT_NONE:
                gMM.sequencer.repeatMode = gMM.sequencer.MODE_REPEAT_ONE;
                break;
            case gMM.sequencer.MODE_REPEAT_ONE:
                gMM.sequencer.repeatMode = gMM.sequencer.MODE_REPEAT_ALL;
                break;
            case gMM.sequencer.MODE_REPEAT_ALL:
                gMM.sequencer.repeatMode = gMM.sequencer.MODE_REPEAT_NONE;
                break;
            default:
                gMM.sequencer.repeatMode = gMM.sequencer.MODE_REPEAT_NONE;
                break;
        }
    },

    /**
     *  Seeks forward <b>interval</b> milliseconds in the currently playing
     *  track.
     *
     *  @param {number} interval The time interval (ms) to advance the
     *      current track.
     */
    seekForward: function seekForward(interval) {
        this._seek(interval, true);
    },

    /**
     *  Seeks backwards <b>interval</b> milliseconds in the currently
     *  playing track.
     *
     *  @param {number} interval The time interval (ms) to rewind the
     *      current track.
     */
    seekBackward: function seekBackward(interval) {
        this._seek(interval, false);
    },

    /**
     * Seeks to a specific position in the currently playing track.
     *
     * @param {number} The new position (ms) in the track.
     */
    seekTo: function seekTo(position) {
        // FIXME: if not playing
        if (!gMM.playbackControl)
            this.play();

        let min = 0;
        let max = gMM.playbackControl.duration - 5000; // TODO: 5s buffer like cmus desirable?

        gMM.playbackControl.position = util.Math.constrain(position, min, max);
    },

    /**
     * Increases the volume by 5% of the maximum volume.
     */
    increaseVolume: function increaseVolume() {
        this.volume = util.Math.constrain(this.volume + 0.05, 0, 1);
    },

    /**
     * Decreases the volume by 5% of the maximum volume.
     */
    decreaseVolume: function decreaseVolume() {
        this.volume = util.Math.constrain(this.volume - 0.05, 0, 1);
    },

    // TODO: Document what this buys us over and above cmd_find_current_track
    /**
     * Focuses the currently playing track.
     */
    focusPlayingTrack: function focusPlayingTrack() {
        this.focusTrack(gMM.sequencer.currentItem);
    },

    /**
     * Searches the current media view for <b>str</b>
     *
     * @param {string} str The search string.
     */
    searchView: function searchView(str) {
        let currentView = _SBGetCurrentView();
        let mediaItemList = currentView.mediaList;
        let search = _getSearchString(currentView);
        let searchString = "";

        if (search != "") // XXX
            searchString = str + " " + search;
        else
            searchString = str;

        this._lastSearchString = searchString;

        let mySearchView = LibraryUtils.createStandardMediaListView(mediaItemList, searchString);

        if (mySearchView.length) {
            this._lastSearchView = mySearchView;
            this._lastSearchIndex = 0;
            this.focusTrack(mySearchView.getItemByIndex(this._lastSearchIndex));
        }
        else
            liberator.echoerr("E486 Pattern not found: " + searchString, commandline.FORCE_SINGLELINE);
    },

    /**
     * Repeats the previous view search.
     *
     * @param {boolean} reverse
     */
    searchViewAgain: function searchViewAgain(reverse) {
        function echo(str) {
            setTimeout(function () {
                commandline.echo(str, commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES | commandline.FORCE_SINGLELINE);
            }, 0);
        }

        if (reverse) {
            if (this._lastSearchIndex == 0) {
                this._lastSearchIndex = this._lastSearchView.length - 1;
                echo("Search hit TOP, continuing at BOTTOM");
            }
            else
                this._lastSearchIndex = this._lastSearchIndex - 1;
        }
        else {
            if (this._lastSearchIndex == (this._lastSearchView.length - 1)) {
                this._lastSearchIndex = 0;
                echo("Search hit BOTTOM, continuing at TOP");
            }
            else
                this._lastSearchIndex = this._lastSearchIndex + 1;
        }

        // FIXME: Implement for "?" --ken
        commandline.echo("/" + this._lastSearchString, null, commandline.FORCE_SINGLELINE);
        this.focusTrack(this._lastSearchView.getItemByIndex(this._lastSearchIndex));

    },

    /**
     * The search dialog keypress callback.
     *
     * @param {string} str The contents of the search dialog.
     */
    onSearchKeyPress: function onSearchKeyPress(str) {
        if (options["incsearch"])
            this.searchView(str);
    },

    /**
     * The search dialog submit callback.
     *
     * @param {string} str The contents of the search dialog.
     */
    onSearchSubmit: function onSearchSubmit(str) {
        this.searchView(str);
    },

    /**
     * The search dialog cancel callback.
     */
    onSearchCancel: function onSearchCancel() {
        // TODO: restore the view state if altered by an 'incsearch' search
    },

    /**
     * Returns an array of all available playlists.
     *
     * @returns {sbIMediaList[]}
     */
    getPlaylists: function getPlaylists() {
        let mainLibrary = LibraryUtils.mainLibrary;
        let playlists = [mainLibrary];
        let listener = {
            onEnumerationBegin: function () { },
            onEnumerationEnd: function () { },
            onEnumeratedItem: function (list, item) {
                // FIXME: why are there null items and duplicates?
                if (!playlists.some(function (list) list.name == item.name) && item.name != null)
                    playlists.push(item);
                return Ci.sbIMediaListEnumerationListener.CONTINUE;
            }
        };

        mainLibrary.enumerateItemsByProperty("http://songbirdnest.com/data/1.0#isList", "1", listener);

        return playlists;
    },

    /**
     * Plays the media item at <b>index</b> in <b>playlist</b>.
     *
     * @param {sbIMediaList} playlist
     * @param {number} index
     */
    playPlaylist: function playPlaylist(playlist, index) {
        gMM.sequencer.playView(playlist.createView(), index);
    },

    /**
     * Returns an array of all available media pages.
     *
     * @returns {sbIMediaPageInfo[]}
     */
    getMediaPages: function getMediaPages() {
        let list = SBGetBrowser().currentMediaPage.mediaListView.mediaList;
        let pages = services.get("mediaPageManager").getAvailablePages(list);
        return ArrayConverter.JSArray(pages).map(function (page) page.QueryInterface(Ci.sbIMediaPageInfo));
    },

    /**
     * Loads the the specified media page into <b>view</b> with the given
     * <b>list</b> of media items.
     *
     * @param {sbIMediaPage} page
     * @param {sbIMediaList} list
     * @param {sbIMediaView} view
     */
    loadMediaPage: function loadMediaPage(page, list, view) {
        services.get("mediaPageManager").setPage(list, page);
        SBGetBrowser().loadMediaList(list, null, null, view, null);
    },

    /**
     * Applys the specified <b>rating<b> to <b>mediaItem<b>.
     *
     * @param {sbIMediaItem} mediaItem The media item to rate.
     * @param {number} rating The star rating (1-5).
     */
    rateMediaItem: function rateMediaItem(mediaItem, rating) {
        mediaItem.setProperty(SBProperties.rating, rating);
    },

    // TODO: add all fields, and ascending arg
    /**
     * Sorts the current media view by <b>field</b>.
     *
     * @param {string} field The sort field.
     */
    sortBy: function sortBy(property) {
        let properties = services.create("mutablePropertyArray");

        switch (property.string) {
            case "#":
            case "Title":
                properties.appendProperty(SBProperties.trackName, "a");
                break;
            case "Rating":
                properties.appendProperty(SBProperties.rating, 1);
                break;
            case "Album":
                properties.appendProperty(SBProperties.albumName, "a");
                break;
            default:
                properties.appendProperty(SBProperties.trackName, "a");
                break;
        }

        _SBGetCurrentView().setSort(properties);
    }
}, {
}, {
    commandline: function () {
        commandline.registerCallback("change", modes.SEARCH_VIEW_FORWARD, this.closure.onSearchKeyPress);
        commandline.registerCallback("submit", modes.SEARCH_VIEW_FORWARD, this.closure.onSearchSubmit);
        commandline.registerCallback("cancel", modes.SEARCH_VIEW_FORWARD, this.closure.onSearchCancel);
    },
    commands: function () {
        // TODO: clear up filter/Filter confusion
        commands.add(["f[ilter]"],
                "Filter tracks based on keywords {genre/artist/album/track}",
                function (args) {
                    let library = LibraryUtils.mainLibrary;
                    let view = LibraryUtils.createStandardMediaListView(LibraryUtils.mainLibrary, args.literalArg);

                    if (view.length == 0)
                        liberator.echoerr("No Tracks matching the keywords");
                    else {
                         SBGetBrowser().loadMediaList(LibraryUtils.mainLibrary, null, null, view,
                                                         "chrome://songbird/content/mediapages/filtersPage.xul");
                         // TODO: make this this.focusTrack work ?
                         this.focusTrack(view.getItemByIndex(0));
                    }
                },
                {
                    argCount: "1",
                    literal: 0
                    //completer: function (context, args) completion.tracks(context, args);
                });

        commands.add(["load"],
            "Load a playlist",
            function (args) {
                let arg = args.literalArg;

                if (arg) {
                    // load the selected playlist/smart playlist
                    let playlists = player.getPlaylists();

                    for ([i, list] in Iterator(playlists)) {
                        if (util.compareIgnoreCase(arg, list.name) == 0) {
                            SBGetBrowser().loadMediaList(playlists[i]);
                            this.focusTrack(_SBGetCurrentView().getItemByIndex(0));
                            return;
                        }
                    }

                    liberator.echoerr("E475: Invalid argument: " + arg);
                }
                else {
                    // load main library if there are no args
                    _SBShowMainLibrary();
                }
            },
            {
                argCount: "?",
                completer: function (context, args) completion.playlist(context, args),
                literal: 0
            });

        // TODO: better off as a single command (:player play) or cmus compatible (:player-play)? --djk
        commands.add(["playerp[lay]"],
            "Play track",
            function () { player.play(); });

        commands.add(["playerpa[use]"],
            "Pause/unpause track",
            function () { player.togglePlayPause(); });

        commands.add(["playern[ext]"],
            "Play next track",
            function () { player.next(); });

        commands.add(["playerpr[ev]"],
            "Play previous track",
            function () { player.previous(); });

        commands.add(["players[top]"],
            "Stop track",
            function () { player.stop(); });

        commands.add(["see[k]"],
            "Seek to a track position",
            function (args) {
                let arg = args[0];

                // intentionally supports 999:99:99
                if (!/^[+-]?(\d+[smh]?|(\d+:\d\d:|\d+:)?\d{2})$/.test(arg))
                    return void liberator.echoerr("E475: Invalid argument: " + arg);

                function ms(t, m) Math.abs(parseInt(t, 10) * { s: 1000, m: 60000, h: 3600000 }[m])

                if (/:/.test(arg)) {
                    let [seconds, minutes, hours] = arg.split(":").reverse();
                    hours = hours || 0;
                    var value = ms(seconds, "s") + ms(minutes, "m") + ms(hours, "h");
                }
                else {
                    if (!/[smh]/.test(arg.substr(-1)))
                        arg += "s"; // default to seconds

                    value = ms(arg.substring(arg, arg.length - 1), arg.substr(-1));
                }

                if (/^[-+]/.test(arg))
                    arg[0] == "-" ? player.seekBackward(value) : player.seekForward(value);
                else
                    player.seekTo(value);

            },
            { argCount: "1" });

        commands.add(["mediav[iew]"],
            "Change the current media view",
            function (args) {
                // FIXME: is this a SB restriction? --djk
                if (!SBGetBrowser().currentMediaPage)
                    return void liberator.echoerr("Exxx: Can only set the media view from the media tab"); // XXX

                let arg = args[0];

                if (arg) {
                    let pages = player.getMediaPages();

                    for ([, page] in Iterator(pages)) {
                        if (util.compareIgnoreCase(arg, page.contentTitle) == 0) {
                            player.loadMediaPage(page, SBGetBrowser().currentMediaListView.mediaList,
                                    SBGetBrowser().currentMediaListView);
                            return;
                        }
                    }

                    liberator.echoerr("E475: Invalid argument: " + arg);
                }
            },
            {
                argCount: "1",
                completer: function (context) completion.mediaView(context),
                literal: 0
            });

        // TODO: Add a completer and order option
        commands.add(["sort[view]"],
                "Sort the current media view",
                function (args) { player.sortBy(args, true); });

        // FIXME: use :add -q like cmus? (not very vim-like are it's multi-option commands) --djk
        commands.add(["qu[eue]"],
            "Queue tracks by artist/album/track",
            function (args) {
                let properties = services.create("mutablePropertyArray");

                // args
                switch (args.length) {
                    case 3:
                        properties.appendProperty(SBProperties.trackName, args[2]);
                    case 2:
                        properties.appendProperty(SBProperties.albumName, args[1]);
                    case 1:
                        properties.appendProperty(SBProperties.artistName, args[0]);
                        break;
                    default:
                        break;
                }

                let library = LibraryUtils.mainLibrary;
                let mainView = library.createView();
                gMM.sequencer.playView(mainView,
                        mainView.getIndexForItem(library.getItemsByProperties(properties).queryElementAt(0, Ci.sbIMediaItem)));
                player.focusPlayingTrack();
            },
            {
                argCount: "+",
                completer: function (context, args) completion.song(context, args)
            });

        // TODO: maybe :vol! could toggle mute on/off? --djk
        commands.add(["vol[ume]"],
            "Set the volume",
            function (args) {
                let arg = args[0];

                if (!/^[+-]?\d+$/.test(arg))
                    return void liberator.echoerr("E488: Trailing characters");

                let level = parseInt(arg, 10) / 100;

                if (/^[+-]/.test(arg))
                    level = player.volume + level;

                player.volume = util.Math.constrain(level, 0, 1);
            },
            { argCount: "1" });
    },
    completion: function () {
        completion.song = function song(context, args) {
            // TODO: useful descriptions?
            function map(list) list.map(function (i) [i, ""]);
            let [artist, album] = [args[0], args[1]];

            if (args.completeArg == 0) {
                context.title = ["Artists"];
                context.completions = map(library.getArtists());
            }
            else if (args.completeArg == 1) {
                context.title = ["Albums by " + artist];
                context.completions = map(library.getAlbums(artist));
            }
            else if (args.completeArg == 2) {
                context.title = ["Tracks from " + album + " by " + artist];
                context.completions = map(library.getTracks(artist, album));
            }
        };

        completion.playlist = function playlist(context, args) {
            context.title = ["Playlist", "Type"];
            context.keys = { text: "name", description: "type" };
            context.completions = player.getPlaylists();
        };

        completion.mediaView = function mediaView(context) {
            context.title = ["Media View", "URL"];
            context.anchored = false;
            context.keys = { text: "contentTitle", description: "contentUrl" };
            context.completions = player.getMediaPages();
        };
    },
    mappings: function () {
        mappings.add([modes.PLAYER],
            ["x"], "Play track",
            function () { player.play(); });

        mappings.add([modes.PLAYER],
            ["z"], "Previous track",
            function () { player.previous(); });

        mappings.add([modes.PLAYER],
            ["c"], "Pause/unpause track",
            function () { player.togglePlayPause(); });

        mappings.add([modes.PLAYER],
            ["b"], "Next track",
            function () { player.next(); });

        mappings.add([modes.PLAYER],
            ["v"], "Stop track",
            function () { player.stop(); });

        mappings.add([modes.PLAYER],
            ["Q"], "Queue tracks by artist/album/track",
            function () { commandline.open(":", "queue ", modes.EX); });

        mappings.add([modes.PLAYER],
            ["f"], "Loads current view filtered by the keywords",
            function () { commandline.open(":", "filter ", modes.EX); });

        mappings.add([modes.PLAYER],
            ["i"], "Select current track",
            function () { gSongbirdWindowController.doCommand("cmd_find_current_track"); });

        mappings.add([modes.PLAYER],
            ["s"], "Toggle shuffle",
            function () { player.toggleShuffle(); });

        mappings.add([modes.PLAYER],
            ["r"], "Toggle repeat",
            function () { player.toggleRepeat(); });

        mappings.add([modes.PLAYER],
            ["h", "<Left>"], "Seek -10s",
            function (count) { player.seekBackward(Math.max(1, count) * 10000); },
            { count: true });

        mappings.add([modes.PLAYER],
            ["l", "<Right>"], "Seek +10s",
            function (count) { player.seekForward(Math.max(1, count) * 10000); },
            { count: true });

        mappings.add([modes.PLAYER],
            ["H", "<S-Left>"], "Seek -1m",
            function (count) { player.seekBackward(Math.max(1, count) * 60000); },
            { count: true });

        mappings.add([modes.PLAYER],
            ["L", "<S-Right>"], "Seek +1m",
            function (count) { player.seekForward(Math.max(1, count) * 60000); },
            { count: true });

        mappings.add([modes.PLAYER],
             ["=", "+"], "Increase volume by 5% of the maximum",
             function () { player.increaseVolume(); });

        mappings.add([modes.PLAYER],
             ["-"], "Decrease volume by 5% of the maximum",
             function () { player.decreaseVolume(); });

        mappings.add([modes.PLAYER],
             ["/"], "Search forward for a track",
             function (args) { commandline.open("/", "", modes.SEARCH_VIEW_FORWARD); });

        mappings.add([modes.PLAYER],
             ["n"], "Find the next track",
             function () { player.searchViewAgain(false);});

        mappings.add([modes.PLAYER],
             ["N"], "Find the previous track",
             function () { player.searchViewAgain(true);});

        for (let i in util.range(0, 6)) {
            let (rating = i) {
                mappings.add([modes.PLAYER],
                     ["<C-" + rating + ">"], "Rate the current media item " + rating,
                     function () {
                         let item = gMM.sequencer.currentItem || _SBGetCurrentView().selection.currentMediaItem; // XXX: a bit too magic
                         if (item)
                             player.rateMediaItem(item, rating);
                         else
                             liberator.beep();
                     }
                );
            };
        }
    },
    options: function () {
        options.add(["repeat"],
            "Set the playback repeat mode",
            "number", 0,
            {
                setter: function (value) gMM.sequencer.repeatMode = value,
                getter: function () gMM.sequencer.repeatMode,
                completer: function (context) [
                    ["0", "Repeat none"],
                    ["1", "Repeat one"],
                    ["2", "Repeat all"]
                ],
                validator: Option.validateCompleter
            });

        options.add(["shuffle"],
            "Play tracks in shuffled order",
            "boolean", false,
            {
                setter: function (value) gMM.sequencer.mode = value ? gMM.sequencer.MODE_SHUFFLE : gMM.sequencer.MODE_FORWARD,
                getter: function () gMM.sequencer.mode == gMM.sequencer.MODE_SHUFFLE
            });
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
