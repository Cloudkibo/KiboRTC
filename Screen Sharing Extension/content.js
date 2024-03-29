﻿// this content-script plays role of medium to publish/subscribe messages from webpage to the background script

// this object is used to make sure our extension isn't conflicted with irrelevant messages!
var kiboconnectionmessages = {
    'are-you-there': true,
    'get-sourceId':  true
};

// this port connects with background script
var port = chrome.runtime.connect();

// if background script sent a message
port.onMessage.addListener(function (message) {
    // get message from background script and forward to the webpage
    window.postMessage(message, '*');
});

// this event handler watches for messages sent from the webpage
// it receives those messages and forwards to background script
window.addEventListener('message', function (event) {
	
	console.log('PRINTING FROM THE EXTENSION')
	console.log(event)
	console.log('END PRINTING FROM THE EXTENSION')
    // if invalid source
    if (event.source != window)
        return;
        
    // it is 3rd party message
    if(!kiboconnectionmessages[event.data]) return;
        
    // if browser is asking whether extension is available
    if(event.data == 'are-you-there') {
        return window.postMessage('kiboconnection-extension-loaded', '*');
    }

    // if it is something that need to be shared with background script
    if(event.data == 'get-sourceId') {
        // forward message to background script
        port.postMessage(event.data);
    }
});

// inform browser that you're available!
window.postMessage('kiboconnection-extension-loaded', '*');
