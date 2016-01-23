// Copyright 2013 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('index.html', {
    bounds: {
      width: 700,
      height: 600
    }
  });
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  chrome.desktopCapture.chooseDesktopMedia(
      ["screen", "window"],
      function(id) {
        sendResponse({"id": id});
      });
});
*/



// this background script is used to invoke desktopCapture API
// to capture screen-MediaStream.

var session = ['screen', 'window'];

chrome.runtime.onConnect.addListener(function (port) {
    port.onMessage.addListener(portOnMessageHanlder);
    
    // this one is called for each message from "content-script.js"
    function portOnMessageHanlder(message) {
        if(message == 'get-sourceId') {
            chrome.desktopCapture.chooseDesktopMedia(session, port.sender.tab, onAccessApproved);
        }
    }

    // on getting sourceId
    // "sourceId" will be empty if permission is denied.
    function onAccessApproved(sourceId) {
        console.log('sourceId', sourceId);
        
        // if "cancel" button is clicked
        if(!sourceId || !sourceId.length) {
            return port.postMessage('PermissionDeniedError');
        }
        
        // "ok" button is clicked; share "sourceId" with the
        // content-script which will forward it to the webpage
        port.postMessage({
            sourceId: sourceId
        });
    }
});

chrome.tabs.executeScript(currentTab.id, { file: 'content.js' }, function() {
  console.log('Injected content-script.');
});
