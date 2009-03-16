//Import Artist List as this can be huge

var artists = getArtistsArray();

function Player()
{
       
        // Get the focus to the visible playlist first
	//window._SBShowMainLibrary();
	
	mappings.add([modes.PLAYER], 
		["x"], "Play Track",
		function () 
		{ 
			gMM.sequencer.play();
		}); 
	
	mappings.add([modes.PLAYER], 
		["z"], "Previous Track",
		function ()
		{
			gSongbirdWindowController.doCommand("cmd_control_previous");
		});

	mappings.add([modes.PLAYER], 
		["c"], "Pause/Unpause Track",
		function ()
		{
			gSongbirdWindowController.doCommand("cmd_control_playpause");
		});
			
	mappings.add([modes.PLAYER], 
		["b"], "Next Track",
		function ()
		{
			gSongbirdWindowController.doCommand("cmd_control_next");
		});
			
	mappings.add([modes.PLAYER], 
		["v"], "Stop Track",
		function ()
		{
			gMM.sequencer.stop(); 
		});


	mappings.add([modes.PLAYER],
		["l"], "Play Media",
		function ()
		{
			commandline.open(":","playmedia ", modes.EX);
		});

	mappings.add([modes.PLAYER],
		["s"], "Toggle Shuffle",
		function ()
		{
			if (gMM.sequencer.mode != gMM.sequencer.MODE_SHUFFLE)
				gMM.sequencer.mode = gMM.sequencer.MODE_SHUFFLE;
			else
				gMM.sequencer.mode = gMM.sequencer.MODE_FORWARD;
		});

	mappings.add([modes.PLAYER],
		["r"], "Toggle Repeat",
		function ()
		{	
			switch(gMM.sequencer.repeatMode)
			{
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
		});

	commands.add(["playmedia"],
		"PLay Media",
		function(args)
		{
			//Store the old view
			//var prev_view = gMM.status.view;
			var library = LibraryUtils.mainLibrary;
			var mainView = library.createView();
			var sqncr = gMM.sequencer;
			var customProps = Cc["@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
					.createInstance(Ci.sbIMutablePropertyArray);
			
			//args
			
			if (args.length == 1){		
				customProps.appendProperty(SBProperties.artistName,args[0].toString());
			}
			else if (args.length == 2){
				customProps.appendProperty(SBProperties.artistName,args[0].toString());
				customProps.appendProperty(SBProperties.albumName,args[1].toString());
			}
			else if (args.length == 3){
				customProps.appendProperty(SBProperties.artistName,args[0].toString());
				customProps.appendProperty(SBProperties.albumName,args[1].toString());
				customProps.appendProperty(SBProperties.trackName,args[2].toString());
			}
			

			sqncr.playView(mainView, mainView.getIndexForItem(library.getItemsByProperties(customProps).queryElementAt(0,Ci.sbIMediaItem)));
					
   
		},
		{ 
			completer: function(context, args) completion.songCompletion(context, args)	
		});
		
	      

}

function getArtists()
{
	return this.artists;
}

function getArtistsArray()
{
   
 var list = LibraryUtils.mainLibrary;  
   
 //  Create an enumeration listener to count each item  
 var listener = {  
  count: 0,  
   onEnumerationBegin: function(aMediaList) {   
     this.count = 0;   
   },  
   onEnumeratedItem: function(aMediaList, aMediaItem) {  
     this.count++;  
   },  
   onEnumerationEnd: function(aMediaList, aStatusCode) {}  
 };  
   
 var artistCounts = {};  
 var artists = list.getDistinctValuesForProperty(SBProperties.artistName);  
 var artist;  
 var artistArray = [];  
 var i=0;
 // Count the number of media items for each distinct artist  
 while (artists.hasMore()) {  
   artist = artists.getNext(); 
   artistArray[i] = [artist,artist];  
   list.enumerateItemsByProperty(SBProperties.artistName,  
                                 artist,  
                                 listener,  
                                 Ci.sbIMediaList.ENUMERATIONTYPE_LOCKING);  
   artistCounts[artist] = listener.count;  
   i++;
 }  
 
 //liberator.dump("Count : "+artistCounts.toSource()); 
 return artistArray;
}

function getAlbums(artist)
{
	var list = LibraryUtils.mainLibrary;
	var albumArray = [];
	var items = list.getItemsByProperty(SBProperties.artistName, artist).enumerate();
	var i = 0;

	while(items.hasMoreElements()) {
		album = items.getNext().getProperty(SBProperties.albumName);
		albumArray[i] = [album, album];
		i++;
	}
	
	return removeDuplicateElement(albumArray);
}

function getTracks(artist,album)
{
	var list = LibraryUtils.mainLibrary;
	var tracksArray = [];
	var pa = Cc["@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
			.createInstance(Ci.sbIMutablePropertyArray);
	var i = 0;
	
	pa.appendProperty(SBProperties.artistName,artist.toString());
	pa.appendProperty(SBProperties.albumName,album.toString());
	var items = list.getItemsByProperties(pa).enumerate();

	while(items.hasMoreElements()) {
		track = items.getNext().getProperty(SBProperties.trackName);
		tracksArray[i] = [track, track];
		i++;
	}

	return tracksArray;
}


function removeDuplicateElement(arrayName)
{
	var newArray=new Array();
label:for(var i=0; i<arrayName.length;i++ )
      {  
	      for(var j=0; j<newArray.length;j++ )
	      {
		      if(newArray[j].toString()==arrayName[i].toString()) 
			      continue label;
	      }
	      newArray[newArray.length] = arrayName[i];
      }
      return newArray;
}
