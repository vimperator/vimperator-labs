// Copyright (c) 2009 by Prathyush Thota <prathyushthota@gmail.com>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.


function Library() { //{{{

    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const MAIN_LIBRARY = LibraryUtils.mainLibrary;

    function toJSArray(enum) ArrayConverter.JSArray(enum)

    function getArtistsArray() {
        return toJSArray(MAIN_LIBRARY.getDistinctValuesForProperty(SBProperties.artistName));
    }

    // Get the artist names before hand.
    let artists = getArtistsArray();

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // TODO: return some actually useful objects. ;-)
    return {

        /**
         * Returns an array of all the artist names in the main library.
         *
         * @returns {string[]}
         */
        getArtists: function getArtists() artists,

        // FIXME: ken do we really want to remove duplicates? If so, why not tracks too? --djk
        /**
         * Returns an array of all the album names for <b>artist</b> in the
         * main library.
         *
         * @param {param} artist The artist name.
         * @returns {string[]}
         */
        getAlbums: function getAlbums(artist) {
            let albums = toJSArray(MAIN_LIBRARY.getItemsByProperty(SBProperties.artistName, artist))
                             .map(function (track) track.getProperty(SBProperties.albumName));
            return util.Array.uniq(albums);
        },

        /**
         * Returns an array of all the track names for <b>artist</b> and
         * <b>album</b> in the main library.
         *
         * @param {param} artist The artist name.
         * @param {param} album  The album name.
         * @returns {string[]}
         */
        getTracks: function getTracks(artist, album) {
            const properties = Cc["@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
                                 .createInstance(Ci.sbIMutablePropertyArray);

            properties.appendProperty(SBProperties.artistName, artist);
            properties.appendProperty(SBProperties.albumName, album);

            return toJSArray(MAIN_LIBRARY.getItemsByProperties(properties))
                       .map(function (track) track.getProperty(SBProperties.trackName));
        }

    };
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
