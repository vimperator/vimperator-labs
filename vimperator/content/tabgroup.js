// Copyright (c) 2011-2012 by teramako <teramako at Gmail>

// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/** @scope modules */

// TODO: many methods do not work with Thunderbird correctly yet

/**
 * @instance tabgroup
 */
const TabGroup = Module("tabGroup", {
    requires: ["config", "tabs"],

    TV: window.TabView,

    get tabView () {
        const TV = window.TabView;
        if (!TV)
            return null;
        if (!TV._window || !TV._window.GroupItems) {
            let waiting = true;
            TV._initFrame(function() { waiting = false; });
            while (waiting)
                liberator.threadYield(false, true);
        }
        delete this.tabView;
        return this.tabView = TV._window;
    },

    get appTabs () {
        var apps = [];
        for (let [, tab] in Iterator(config.tabbrowser.tabs)) {
            if (tab.pinned)
                apps.push(tab);
            else
                break;
        }
        return apps;
    },

    /**
     * @param {string|number} name
     * @param {number} count
     * @return {GroupItem}
     */
    getGroup: function getGroup (name, count) {
        let i = 0;
        if (!count)
            count = 1;

        let test = typeof name == "number" ?
            function (g) g.id == name :
            function (g) g.id == name || g.getTitle() == name;
        for (let [, group] in Iterator(this.tabView.GroupItems.groupItems)) {
            if (test(group)) {
                i++;
                if (i == count)
                    return group;
            }
        }
        return null;
    },

    /**
     * switch to a group or an orphaned tab
     * @param {String|Number} spec
     * @param {Boolean} wrap
     */
    switchTo: function (spec, wrap) {
        const GI = tabGroup.tabView.GroupItems;
        let current = GI.getActiveGroupItem() || GI.getActiveOrphanTab();
        let groupsAndOrphans = GI.groupItems.concat(GI.getOrphanedTabs());
        let offset = 1, relative = false, index;
        if (typeof spec === "number")
            index = parseInt(spec, 10);
        else if (/^[+-]\d+$/.test(spec)) {
            let buf = parseInt(spec, 10);
            index = groupsAndOrphans.indexOf(current) + buf;
            offset = buf >= 0 ? 1 : -1;
            relative = true;
        }
        else if (spec != "") {
            if (/^\d+$/.test(spec))
                spec = parseInt(spec, 10);
            let targetGroup = tabGroup.getGroup(spec);
            if (targetGroup)
                index = groupsAndOrphans.indexOf(targetGroup);
            else {
                liberator.echoerr("No such group: " + spec);
                return;
            }
        } else
            return;

        let length = groupsAndOrphans.length;
        let apps = tabGroup.appTabs;

        function groupSwitch (index, wrap) {
            if (index > length - 1)
                index = wrap ? index % length : length - 1;
            else if (index < 0)
                index = wrap ? index % length + length : 0;

            let target = groupsAndOrphans[index], group = null;
            if (target instanceof tabGroup.tabView.GroupItem) {
                group = target;
                target = target.getActiveTab() || target.getChild(0);
            }

            if (target)
              gBrowser.mTabContainer.selectedItem = target.tab;
            // for empty group
            else if (group && apps.length != 0) {
              GI.setActiveGroupItem(group);
              tabView.UI.goToTab(tabs.getTab(0));
            }
            else if (relative)
              groupSwitch(index + offset, true);
            else
            {
              liberator.echoerr("Cannot switch to " + spec);
              return;
            }
        }
        groupSwitch(index, wrap);
    },

    /**
     * @param {string} name Group Name
     * @param {boolean} shouldSwitch switch to the created group if true
     * @param {element} tab
     * @return {GroupItem} created GroupItem instance
     */
    createGroup: function createGroup (name, shouldSwitch, tab) {
        let pageBounds = tabGroup.tabView.Items.getPageBounds();
        pageBounds.inset(20, 20);
        let box = new tabGroup.tabView.Rect(pageBounds);
        box.width = 125;
        box.height = 110;
        let group = new tabGroup.tabView.GroupItem([], { bounds: box, title: name });

        if (tab && !tab.pinned)
            tabGroup.TV.moveTabTo(tab, group.id);

        if (shouldSwitch) {
            let appTabs = tabGroup.appTabs,
                child = group.getChild(0);
            if (child) {
                tabGroup.tabView.GroupItems.setActiveGroupItem(group);
                tabGroup.tabView.UI.goToTab(child.tab);
            }
            else if (appTabs.length == 0)
                group.newTab();
            else {
                tabGroup.tabView.GroupItems.setActiveGroupItem(group);
                tabGroup.tabView.UI.goToTab(appTabs[appTabs.length - 1]);
            }

        }
        return group;
    },

    /**
     * @param {element} tab element
     * @param {GroupItem||string} group See {@link tabGroup.getGroup}.
     * @param {boolean} create Create a new group named {group}
     *                  if {group} doesn't exist.
     */
    moveTab: function moveTabToGroup (tab, group, shouldSwitch) {
        liberator.assert(tab && !tab.pinned, "Cannot move an AppTab");

        let groupItem = (group instanceof tabGroup.tabView.GroupItem) ? group : tabGroup.getGroup(group);
        liberator.assert(groupItem, "No such group: " + group);

        if (groupItem) {
            tabGroup.TV.moveTabTo(tab, groupItem.id);
            if (shouldSwitch)
                tabGroup.tabView.UI.goToTab(tab);
        }
    },

    /**
     * close all tabs in the {groupName}'s or current group
     * @param {string} groupName
     */
    remove: function removeGroup (groupName) {
        const GI = tabGroup.tabView.GroupItems;
        let activeGroup = GI.getActiveGroupItem();
        let group = groupName ? tabGroup.getGroup(groupName) : activeGroup;
        liberator.assert(group, "No such group: " + groupName);

        if (group === activeGroup) {
            let gb = config.tabbrowser;
            let vTabs = gb.visibleTabs;
            if (vTabs.length < gb.tabs.length)
                tabGroup.switchTo("+1", true);
            else {
                let appTabs = tabGroup.appTabs;
                if (appTabs.length == 0)
                    gb.loadOnTab("about:blank", { inBackground: false, relatedToCurrent: false });
                else
                    gb.mTabContainer.selectedIndex = appTabs.length - 1;

                for (let i = vTabs.length - 1, tab; (tab = vTabs[i]) && !tab.pinned; i--)
                    gb.removeTab(tab);

                return;
            }
        }
        group.closeAll();
    }

}, {
}, {
    mappings: function () {
        mappings.add([modes.NORMAL], ["g@"],
            "Go to an AppTab",
            function (count) {
                let appTabs = tabGroup.appTabs;
                let i = 0;
                if (count != null)
                      i = count - 1;
                else {
                    let currentTab = tabs.getTab();
                    if (currentTab.pinned)
                        i = appTabs.indexOf(currentTab) + 1;

                    i %= appTabs.length;
                }
                if (appTabs[i])
                    config.tabbrowser.mTabContainer.selectedIndex = i;
            },
            { count: true });

        mappings.add([modes.NORMAL], ["<C-S-n>", "<C-S-PageDown>"],
            "Switch to next tab group",
            function (count) { tabGroup.switchTo("+" + (count || 1), true); },
            { count: true });

        mappings.add([modes.NORMAL], ["<C-S-p>", "<C-S-PageUp>"],
            "Switch to previous tab group",
            function (count) { tabGroup.switchTo("-" + (count || 1), true); },
            { count: true });
    },

    commands: function () {
        let panoramaSubCommands = [
            /**
             * Panorama SubCommand mkgroup
             * make a group and switch to the group.
             * take up the current tab to the group if bang(!) specified.
             */
            new Command(["mk[group]"], "Create a tab group",
                function (args) { tabGroup.createGroup(args.literalArg, true, args.bang ? tabs.getTab() : null); },
                { bang: true, literal: 0 }),
            /**
             * Panorama SubCommand switchgroup
             * switch to the {group}.
             * switch to {count}th next group if {count} specified.
             */
            new Command(["switchgroup", "sg"], "Switch to another group",
                function (args) {
                    if (args.count > 0)
                        tabGroup.swtichTo("+" + args.count, true);
                    else
                        tabGroup.switchTo(args.literalArg);
                }, {
                    count: true,
                    literal: 0,
                    completer: function (context) completion.tabgroup(context, true),
                }),
            /**
             * Panorama SubCommand stash
             * stash the current tab to the {group}
             * create {group} and stash if bang(!) specified and {group} doesn't exists.
             */
            new Command(["stash"], "Stash the current tab to another group",
                function (args) {
                    let currentTab = tabs.getTab();
                    if (currentTab.pinned) {
                        liberator.echoerr("Cannot stash an AppTab");
                        return;
                    }
                    let groupName = args.literalArg;
                    let group = tabGroup.getGroup(groupName);
                    if (!group) {
                        if (args.bang)
                            group = tabGroup.createGroup(groupName);
                        else {
                            liberator.echoerr("No such group: " + groupName.quote() + ". Add \"!\" if you want to create it.");
                            return;
                        }
                    }
                    tabGroup.moveTab(currentTab, group);
                }, {
                    bang: true,
                    literal: 0,
                    completer: function (context) completion.tabgroup(context, true),
                }),
            /**
             * Panorama SubCommand rmgroup
             * remove {group}.
             * remve the current group if {group} is ommited.
             */
            new Command(["rm[group]"], "Close all tabs in the group",
                function (args) { tabGroup.remove(args.literalArg); },
                {
                    literal: 0,
                    completer: function (context) completion.tabgroup(context, false),
                }),
            /**
             * Panorama SubCommad pullTab
             * pull the other group's tab
             */
            new Command(["pull[tab]"], "Pull a tab from another group",
                function (args) {
                    let activeGroup = tabGroup.tabView.GroupItems.getActiveGroupItem();
                    if (!activeGroup) {
                        liberator.echoerr("Cannot pull to the current group.");
                        return;
                    }
                    let buffer = args.literalArg;
                    if (!buffer)
                        return;

                    let tabItems = tabs.getTabsFromBuffer(buffer);
                    if (tabItems.length == 0) {
                        liberator.echoerr("E94: No matching buffer for " + buffer);
                        return;
                    } else if (tabItems.length > 1) {
                        liberator.echoerr("E93: More than one match for " + buffer);
                        return;
                    }
                    tabGroup.moveTab(tabItems[0], activeGroup, args.bang);
                }, {
                    bang: true,
                    literal: 0,
                    completer: function (context) completion.buffer(context),
                }),
        ];
        commands.add(["panorama", "tabgroups"],
            "Manage tab groups",
            function (args) {
                let list = template.genericOutput("Panorama Help",
                    <dl>{ template.map(panoramaSubCommands, function(cmd)
                        <><dt hightlight="title">{cmd.names.join(", ")}</dt><dd>{cmd.description}</dd></>) }</dl>);
                commandline.echo(list, commandline.HL_NORMAL);
            }, {
                subCommands: panoramaSubCommands
            });
    },

    completion: function () {
        completion.tabgroup = function TabGroupCompleter (context, excludeActiveGroup) {
            const GI = tabGroup.tabView.GroupItems;
            let groupItems = GI.groupItems;
            if (excludeActiveGroup) {
                let activeGroup = GI.getActiveGroupItem();
                if (activeGroup)
                    groupItems = groupItems.filter(function(group) group.id != activeGroup.id);
            }
            context.title = ["TabGroup"];
            context.completions = groupItems.map(function(group) {
                let title = group.getTitle();
                let desc = [
                    "Title:", title || "(Untitled)",
                    "TabNum:", group.getChildren().length,
                ].join(" ");
                if (!title)
                    title = group.id;

                return [title, desc];
            });
        };
    },
});

// vim: set fdm=marker sw=4 ts=4 et:
