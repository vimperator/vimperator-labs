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

}, {
}, {
});

// vim: set fdm=marker sw=4 ts=4 et:
