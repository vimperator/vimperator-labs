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
     * switch to a group or a orphaned tab
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
}, {
}, {
    mappings: function () {
        mappings.add([modes.NORMAL], ["g@"],
            "Go to AppTab",
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
            "switch to next group",
            function (count) { tabGroup.switchTo("+" + (count || 1), true); },
            { count: true });

        mappings.add([modes.NORMAL], ["<C-S-p>", "<C-S-PageUp>"],
            "switch to previous group",
            function (count) { tabGroup.switchTo("-" + (count || 1), true); },
            { count: true });
    },
});

// vim: set fdm=marker sw=4 ts=4 et:
