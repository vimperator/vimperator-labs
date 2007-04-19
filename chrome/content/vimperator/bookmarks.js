/*
 * low-level BOOKMARK and HISTORY handling
 * 
 * these commands try to be generic and don't use any GUI handling code
 * for higher-level functions look into commands.js
 */

function getProperty( aInput, aArc, DS )
{
	var node;
	node = DS.GetTarget( aInput, aArc, true );
	if( node instanceof Components.interfaces.nsIRDFResource ) {
		return node.Value;
	}
	if( node instanceof Components.interfaces.nsIRDFLiteral ) {
		return node.Value;
	}
	return "";
}

function addBookmark(title, uri)
{
	folder = RDF.GetResource("NC:BookmarksRoot");
	var rSource = BookmarksUtils.createBookmark(title, uri, null, title);
	var selection = BookmarksUtils.getSelectionFromResource(rSource);
	var target = BookmarksUtils.getTargetFromFolder(folder);
	BookmarksUtils.insertAndCheckSelection("newbookmark", selection, target);

	//also update bookmark cache
	g_bookmarks.unshift([uri, title]);
}

/* no idea what it does, it Just Works (TM)
 *
 * returns number of deleted bookmarks
 */
function deleteBookmark(url)
{ 
	var deleted = 0;

	// gNC_NS for trunk, NC_NS for 1.X 
	try {var pNC_NS; pNC_NS = gNC_NS;} catch (err) { pNC_NS = NC_NS;} 
	if(! BMSVC || ! BMDS || ! RDF || ! pNC_NS ) return null; 
	if ( !url) return null; // just in case 

	var curfolder = RDF.GetResource("NC:BookmarksRoot");
	var urlArc = RDF.GetResource(pNC_NS+"URL"); 
	var urlLiteral = RDF.GetLiteral(url);
	if (BMDS.hasArcIn(urlLiteral, urlArc)) { 
		var bmResources, bmResource, title, uri, type, ptype; 
		bmResources = BMSVC.GetSources(urlArc, urlLiteral, true); 
		while (bmResources.hasMoreElements()) { 
			bmResource = bmResources.getNext(); 
			type = BookmarksUtils.resolveType(bmResource); 
			if (type != "ImmutableBookmark") { 
				ptype = BookmarksUtils.resolveType(BMSVC.getParent(bmResource)); 
//				alert(type);
//				if ( type == "Folder")  // store the current folder
//					curfolder = bmResource;
				if ( (type == "Bookmark" || type == "IEFavorite") &&  ptype != "Livemark") { 
					title = BookmarksUtils.getProperty(bmResource, pNC_NS+"Name"); 
					uri = BookmarksUtils.getProperty(bmResource, pNC_NS+"URL"); 

					if (uri == url)
					{
						RDFC.Init(BMDS, BMSVC.getParent(bmResource));
						RDFC.RemoveElement(bmResource, true);
						deleted++;
					}
				} 
			} 
		} 
	} 

	// also update bookmark cache, if we removed at least one bookmark
	if(deleted > 0)
		bookmarks_loaded = false;

	return deleted; 
}

/* call the function like this:
   var res = new Object();
   parseBookmarkString("-t tag1,tag2 -T title http://www.orf.at", res);
   res.tags is an array of tags
   res.title is the title or "" if no one was given
   res.url is the url as a string

   returns false, if parsing failed
*/
function parseBookmarkString(str, res)
{
	res.tags = [];
	res.title = null;
	res.url = null;

	var re_title = /^\s*((-t|--title)\s+(\w+|\".*\"))(.*)/;
	var re_tags = /^\s*((-T|--tags)\s+((\w+)(,\w+)*))(.*)/;
	var re_url = /^\s*(\".+\"|\S+)(.*)/;

	var match_tags = null;
	var match_title = null;
	var match_url = null;

	while(!str.match(/^\s*$/))
	{
		/* first check for --tags */
		match_tags = str.match(re_tags);
		if(match_tags != null)
		{
			str = match_tags[match_tags.length-1]; // the last captured parenthesis is the rest of the string
			tags = match_tags[3].split(",");
			res.tags = res.tags.concat(tags);
		}
		else /* then for --titles */
		{

			match_title = str.match(re_title);
			if(match_title != null)
			{
				// only one title allowed
				if (res.title != null)
					return false;

				str = match_title[match_title.length-1]; // the last captured parenthesis is the rest of the string
				title = match_title[3];
				if(title.charAt(0) == '"')
					title = title.substring(1,title.length-1);
				res.title = title;
			}
			else /* at last check for an url */
			{
				match_url = str.match(re_url);
				if (match_url != null)
				{
					// only one url allowed
					if (res.url != null)
						return false;

					str = match_url[match_url.length-1]; // the last captured parenthesis is the rest of the string
					url = match_url[1];
					if(url.charAt(0) == '"')
						url = url.substring(1,url.length-1);
					res.url = url;
				}
				else return false; // no url, tag or title found but still text left, abort
			}
		}
	}
	
	return true;
}

// vim: set fdm=marker sw=4 ts=4:
