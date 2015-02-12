(function () {

  // Create all modules and define dependencies to make sure they exist
  // and are loaded in the correct order to satisfy dependency injection
  // before all nested files are concatenated by Gulp

  // Config
  angular.module('kiboRtc.config', [])
      .value('kiboRtc.config', {
          debug: true
      });

  // Modules
  angular.module('kiboRtc.directives', []);
  angular.module('kiboRtc.filters', []);
  angular.module('kiboRtc.services', []);
  angular.module('kiboRtc',
      [
          'kiboRtc.config',
          'kiboRtc.directives',
          'kiboRtc.filters',
          'kiboRtc.services'
      ]);

})();

'use strict';

/**
 * This is the core File Transfer service. It is independent of the video call service. It depends on Signalling service
 * for doing Signalling. Furthermore, it uses services from configuration too. To use this, one should follow the WebRTC
 * call procedure. Here it is mostly same as standard procedure of a WebRTC call, but this service hides much of the
 * details from application.
 */
angular.module('kiboRtc.services')
    .factory('FileTransfer', function FileTransfer($rootScope, pc_config, pc_constraints, sdpConstraints, video_constraints, Signalling) {

        var isInitiator = false;            /* It indicates which peer is the initiator of the call */
        var isStarted = false;              /* It indicates whether the WebRTC session is started or not */

        var sendChannel;                    /* Channel to send the data to other peer */
        var receiveChannel;                 /* Channel to receive the date from other peer */

        var pc;                             /* Peer Connection object */

        var message;                        /* message by other peer is hold here for application to pick */

        return {


            /**
             * Creates Peer Connection and opens the data channel. Application must call this function when
             * peer wants to send the file to other peer. We try to open the data channel on reliable protocol,
             * if failed we fall back to unreliable. Furthermore, service attaches some private callback functions
             * to some WebRTC connection events. Application doesn't need to care about them.             *
             */
            createPeerConnection: function (cb) {
                try {

                    pc = new RTCPeerConnection(pc_config, {optional: []});//pc_constraints);
                    pc.onicecandidate = handleIceCandidate;

                    //if (!$scope.isInitiator_DC) {
                    try {
                        // Reliable Data Channels not yet supported in Chrome
                        try {
                            sendChannel = pc.createDataChannel("sendDataChannel", {reliable: true});
                        }
                        catch (e) {
                            console.log('UNRELIABLE DATA CHANNEL')
                            sendChannel = pc.createDataChannel("sendDataChannel", {reliable: false});
                        }
                        sendChannel.onmessage = handleMessage;
                        trace('Created send data channel');
                    } catch (e) {
                        cb(e);
                        trace('createDataChannel() failed with exception: ' + e.message);
                        return;
                    }
                    sendChannel.onopen = handleSendChannelStateChange;
                    sendChannel.onclose = handleSendChannelStateChange;
                    //} else {
                    pc.ondatachannel = gotReceiveChannel;

                    cb(null);
                    //}
                } catch (e) {
                    cb(e);
                    console.log('Failed to create PeerConnection, exception: ' + e.message);
                }
            },

            /**
             * Send data or message to other peer using WebRTC Data Channel.
             *
             * @param data data or message which should be sent to other peer
             */
            sendData: function (data) {
                sendChannel.send(data);
            },

            /**
             * Create and Send Offer to other peer. When initiator has got the camera access and has subsequently
             * made the peer connection object using createPeerConnection(), it must call this function now to send
             * the offer to other party. This function uses two private functions as callback to set local description
             * and handle the create offer error. Application doesn't need to care about these functions.
             *
             */
            createAndSendOffer: function () {
                pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
            },

            /**
             * Create and Send Answer to the peer who made the offer. When peer receives offer from the initiator,
             * it must call this function after setting the remote description. It uses the sdbConstraints from the
             * configurations. It has the callback functions to set local description and handle create answer error.
             * Application is responsible for listening the "message" socket.io event and then check if type is offer.
             * Subsequently, application must call this function to send answer.
             *
             */
            createAndSendAnswer: function () {
                pc.createAnswer(setLocalAndSendMessage, function (error) {
                    console.log(error)
                }, sdpConstraints);
            },

            /**
             * On receiving remote description from other peer with offer or answer message, application must call this
             * function to set the remote description to peer connection object.
             *
             * @param message It is the remote description sent to the local peer
             */
            setRemoteDescription: function (message) {
                pc.setRemoteDescription(new RTCSessionDescription(message));
            },

            /**
             * On receiving ice candidate from other peer, application must call this function to add this candidate
             * to local peer connection object. Application is responsible for listening the "message" socket.io event
             * and then check if type is candidate. Subsequently, appliction must call this function to set the remote
             * candidates.
             *
             * @param message It is the remote candidate sent to the local peer
             */
            addIceCandidate: function (message) {
                var candidate = new RTCIceCandidate({
                    sdpMLineIndex: message.label,
                    candidate: message.candidate
                });
                pc.addIceCandidate(candidate);
            },

            /**
             * Gracefully Ends the WebRTC Peer Connection. When any peer wants to end the connection, it must call this function.
             * It is the responsibility of application to inform other peer about ending of the connection. Application would
             * clean or change the UI itself. Both the peers should call this function to end the connection.
             *
             */
            endConnection: function () {
                isStarted = false;
                isInitiator = false;

                try {
                    pc.close();
                } catch (e) {
                }

            },

            /**
             * Whenever data is received from other peer using data channel, it is stored in the "message" variable
             * which can be retrieved by application using this function.
             *
             * @returns {*}
             */
            getMessage: function () {
                return message;
            },

            /**
             * Application can set this to true for the peer who is the initiator of the call. Service must know
             * who is the initiator of the call. Initiator is the one who sends the offer to other peer.
             *
             * @param value Boolean variable to set the value for isInitiator
             */
            setInitiator: function (value) {
                isInitiator = value;
            },

            /**
             * Application can check if the peer is set as initiator or not by using this function. Initiator is
             * the one who sends the offer to other peer.
             * @returns {boolean}
             */
            getInitiator: function () {
                return isInitiator;
            },

            /**
             * Application can set this to true if the call or signalling has been started. This can be used to
             * put some controls i.e. do not send the candidates until the call is started
             *
             * @param value
             */
            setIsStarted: function (value) {
                isStarted = value;
            },

            /**
             * Application can check if the call or signalling has started or not. This can be used to put some controls.
             * i.e. do not send the candidates until the call is started
             *
             * @returns {boolean}
             */
            getIsStarted: function () {
                return isStarted;
            },

            /**
             * Use this to avoid xss attack
             * recommended escaped char's found here - https://www.owasp.org/index.php/XSS_(Cross_Site_Scripting)_Prevention_Cheat_Sheet#RULE_.231_-_HTML_Escape_Before_Inserting_Untrusted_Data_into_HTML_Element_Content
             *
             * @param msg
             * @returns {*}
             */

            sanitize: function (msg) {
                msg = msg.toString();
                return msg.replace(/[\<\>"'\/]/g, function (c) {
                    var sanitize_replace = {
                        "<": "&lt;",
                        ">": "&gt;",
                        '"': "&quot;",
                        "'": "&#x27;",
                        "/": "&#x2F;"
                    }
                    return sanitize_replace[c];
                });
            },

            /**
             * bootstrap alerts!
             *
             * @param text
             */
            bootAlert: function (text) {
                alert(text);
                console.log('Boot_alert: ', text);
            },

            /**
             * File System Errors
             * credit - http://www.html5rocks.com/en/tutorials/file/filesystem/
             *
             * @param e
             * @constructor
             */
            FSerrorHandler: function (e) {
                var msg = '';
                switch (e.code) {
                    case FileError.QUOTA_EXCEEDED_ERR:
                        msg = 'QUOTA_EXCEEDED_ERR';
                        break;
                    case FileError.NOT_FOUND_ERR:
                        msg = 'NOT_FOUND_ERR';
                        break;
                    case FileError.SECURITY_ERR:
                        msg = 'SECURITY_ERR';
                        break;
                    case FileError.INVALID_MODIFICATION_ERR:
                        msg = 'INVALID_MODIFICATION_ERR';
                        break;
                    case FileError.INVALID_STATE_ERR:
                        msg = 'INVALID_STATE_ERR';
                        break;
                    default:
                        msg = 'Unknown Error';
                        break;
                }

                console.error('Error: ' + msg);
            },

            /**
             * File size is often given to us in bytes. We need to convert them to MBs or GBs for user
             * readability.
             *
             * @param fileSizeInBytes file size in bytes
             * @returns {string} File Size with appropriate unit
             */
            getReadableFileSizeString: function (fileSizeInBytes) {
                var i = -1;
                var byteUnits = [' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];
                do {
                    fileSizeInBytes = fileSizeInBytes / 1024;
                    i++;
                } while (fileSizeInBytes > 1024);
                return Math.max(fileSizeInBytes, 0.1).toFixed(1) + byteUnits[i];
            },

            /**
             * used for debugging - credit - http://stackoverflow.com/questions/9267899/arraybuffer-to-base64-encoded-string
             *
             * @param buffer
             * @returns {string}
             * @private
             */
            _arrayBufferToBase64: function (buffer) {
                var binary = ''
                var bytes = new Uint8Array(buffer)
                var len = bytes.byteLength;
                for (var i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i])
                }
                return window.btoa(binary);
            },

            /**
             * This is the chunk size limit for data to be sent or received using data channel. It might increase
             * if browser supports in future.
             *
             * @param me
             * @param peer
             * @returns {number}
             */
            getChunkSize: function (me, peer) {
                return 16000;//64000;//36000;
            }
        };

        /**
         * Handle Ice Candidate and send it to other peer. This callback is called from within the peer connection object
         * whenever there are candidates available. We need to send each candidate to remote peer. For this, we use
         * signalling service of this library. Refer to the Signalling Service for more information on signalling.
         *
         * This function is not exposed to application and is handled by library itself.
         *
         * @param event holds the candidate
         */
        function handleIceCandidate(event) {
            if (event.candidate) {
                Signalling.sendMessageForDataChannel({
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            } else {
                //console.log('End of candidates.');
            }
        }

        /**
         * Set Local Description and send it to other peer. This callback function is called by createOffer()
         * function of the peer connection object. We need to set the Local Description in peer connection object
         * and then send it to the other peer too. Signalling service is used to send it to other peer. Refer to
         * Signalling service for more information on it.
         *
         * @param sessionDescription description about the session
         */
        function setLocalAndSendMessage(sessionDescription) {
            // Set Opus as the preferred codec in SDP if Opus is present.
            pc.setLocalDescription(sessionDescription);
            //console.log('setLocalAndSendMessage sending message' , sessionDescription);
            Signalling.sendMessageForDataChannel(sessionDescription);
        }

        /**
         * Handle the Create Offer Error. This callback function is called by createOffer() function of the
         * peer connection object whenever there is an error while creating the offer.
         *
         * @param error information about the error which occurred while creating offer
         */
        function handleCreateOfferError(error) {
            console.log('createOffer() error: ', error);
        }

        /**
         * This callback function is used to handle the message sent by other peer. The message is sent using data channel
         * of WebRTC. It broadcasts this message to the application so that application can use the message.
         *
         * @param event contains the data sent by other peer
         */
        function handleMessage(event) {
            //trace('MESSAGE GOT: ' + event.data);
            //document.getElementById("dataChannelReceive").value = event.data;

            message = event.data;

            $rootScope.$broadcast("dataChannelMessageReceived");

        }

        /**
         * This callback function is used to handle the sendChannel's state whether it is opened or closed.
         *
         * todo: look for more documentation of this from WebRTC
         */
        function handleSendChannelStateChange() {
            var readyState = sendChannel.readyState;
            //trace('Send channel state is: ' + readyState);
        }

        /**
         * This callback function is called by WebRTC whenever the receiving channel is opened. This receiving channel
         * is the channel through which data travels.
         *
         * @param event holds the channel
         */
        function gotReceiveChannel(event) {
            //trace('Receive Channel Callback');
            sendChannel = event.channel;
            sendChannel.onmessage = handleMessage;
            sendChannel.onopen = handleReceiveChannelStateChange;
            sendChannel.onclose = handleReceiveChannelStateChange;
        }

        /**
         * This is used to handle the situation when receive channel is opened or closed. Application should
         * modify the UI depending on whether the data channel is opened or not.
         *
         * todo: notify the change to application using a broadcast
         */
        function handleReceiveChannelStateChange() {
            var readyState = sendChannel.readyState;
            //trace('Receive channel state is: ' + readyState);
        }

    });

'use strict';

angular.module('kiboRtc.services')
    .factory('RTCConference', function RTCConference($rootScope, pc_config, pc_constraints, sdpConstraints, video_constraints, Signalling) {

        var pcIndex = 0;
        var pcLength = 4;

        var isChannelReady;                 /* It is used to check Data Channel is ready or not */
        var isInitiator = false;            /* It indicates which peer is the initiator of the call */
        var isStarted = false;              /* It indicates whether the WebRTC session is started or not */

        var sendChannel = new Array(pcLength);
        var receiveChannel;

        var localStream;
        var localStreamScreen;

        var pc = new Array(pcLength);       /* Array of Peer Connection Objects */

        var remoteStream1;
        var remoteStream2;
        var remoteStream3;
        var remoteStream4;

        var remoteStreamScreen;

        var remotevideo1;
        var remotevideo2;
        var remotevideo3;
        var remotevideo4;

        var remoteVideoScreen;

        var localvideo;
        var localvideoscreen;

        var iJoinLate = false;

        var screenSharePCIndex = 0;

        var turnReady;

        return {

            /**
             * Initialize the media elements. Application must call this function prior to making any WebRTC video
             * call. Application's UI must contain four video elements: two for local peer and two for remote peer.
             * Service would attach the local and incoming streams to these video elements by itself. You must get
             * the reference of these elements and pass them as parameters.
             *
             * @param remVid1
             * @param remVid2
             * @param remVid3
             * @param remVid4
             * @param remVidScr
             * @param locVid
             * @param locVidScr
             */
            initialize: function (remVid1, remVid2, remVid3, remVid4, remVidScr, locVid, locVidScr) {
                remotevideo1 = remVid1;
                remotevideo2 = remVid2;
                remotevideo3 = remVid3;
                remotevideo4 = remVid4;
                remoteVideoScreen = remVidScr;
                localvideo = locVid;
                localvideoscreen = locVidScr;
            },

            /**
             * Creates Peer Connection and attaches the local stream to it. Application must call this function when
             * it knows that both the peers have got the local camera and mic access. In RTCPeerConnection(), we use
             * pc_config service from the configurations. Furthermore, service attaches some private callback functions
             * to some WebRTC connection events. Application doesn't need to care about them. This function assumes
             * that the local peer has got the camera and mic access and it adds the stream to peer connection object.
             *
             */
            createPeerConnection: function () {
                try {
                    //
                    //Different URL way for FireFox
                    //
                    pc[pcIndex] = new RTCPeerConnection(pc_config, {optional: []});//pc_constraints);
                    pc[pcIndex].onicecandidate = handleIceCandidate;
                    pc[pcIndex].onaddstream = handleRemoteStreamAdded;
                    pc[pcIndex].onremovestream = handleRemoteStreamRemoved;

                    //if (isInitiator) {
                    try {
                        // Reliable Data Channels not yet supported in Chrome
                        try {
                            sendChannel[pcIndex] = pc[pcIndex].createDataChannel("sendDataChannel", {reliable: true});
                        }
                        catch (e) {
                            console.log('UNRELIABLE DATA CHANNEL')
                            sendChannel[pcIndex] = pc[pcIndex].createDataChannel("sendDataChannel", {reliable: false});
                        }
                        sendChannel[pcIndex].onmessage = handleMessage;
                        trace('Created send data channel');
                    } catch (e) {
                        alert('Failed to create data channel. ' +
                        'You need Chrome M25 or later with RtpDataChannel enabled : ' + e.message);
                        trace('createDataChannel() failed with exception: ' + e.message);
                    }
                    sendChannel[pcIndex].onopen = handleSendChannelStateChange;
                    sendChannel[pcIndex].onclose = handleSendChannelStateChange;
                    // } else {
                    pc[pcIndex].ondatachannel = gotReceiveChannel;
                    pc.addStream(localStream);
                    // }
                } catch (e) {
                    console.log('Failed to create PeerConnection, exception: ' + e.message);
                    alert('Cannot create RTCPeerConnection object.');
                    return;
                }
            },

            /**
             * Create and Send Offer to other peer. When initiator has got the camera access and has subsequently
             * made the peer connection object using createPeerConnection(), it must call this function now to send
             * the offer to other party. This function uses two private functions as callback to set local description
             * and handle the create offer error. Application doesn't need to care about these functions.
             *
             */
            createAndSendOffer: function () {
                pc[pcIndex].createOffer(setLocalAndSendMessage, handleCreateOfferError);
            },

            /**
             * Create and Send Answer to the peer who made the offer. When peer receives offer from the initiator,
             * it must call this function after setting the remote description. It uses the sdbConstraints from the
             * configurations. It has the callback functions to set local description and handle create answer error.
             * Application is responsible for listening the "message" socket.io event and then check if type is offer.
             * Subsequently, application must call this function to send answer.
             *
             */
            createAndSendAnswer: function () {
                pc[pcIndex].createAnswer(setLocalAndSendMessage, function (error) {
                    console.log(error)
                }, sdpConstraints);
            },

            /**
             * On receiving remote description from other peer with offer or answer message, application must call this
             * function to set the remote description to peer connection object.
             *
             * @param message It is the remote description sent to the local peer
             */
            setRemoteDescription: function (message) {
                pc.setRemoteDescription(new RTCSessionDescription(message));
            },

            /**
             * On receiving ice candidate from other peer, application must call this function to add this candidate
             * to local peer connection object. Application is responsible for listening the "message" socket.io event
             * and then check if type is candidate. Subsequently, appliction must call this function to set the remote
             * candidates.
             *
             * @param message It is the remote candidate sent to the local peer
             */
            addIceCandidate: function (message) {
                var candidate = new RTCIceCandidate({
                    sdpMLineIndex: message.label,
                    candidate: message.candidate
                });
                pc.addIceCandidate(candidate);
            },

            /**
             * Capture the User Media. Application must call this function to capture camera and mic. This function
             * uses video_constraints from the configurations. It sets the callback with null on success and err
             * on error. It attaches the local media stream to video element for the application.
             *
             * @param streamType Type of the stream to be captured. Possible values are "audio" or "video"
             * @param cb It is the callback which should be called with err if there was an error in accessing the media
             */
            captureUserMedia: function (cb) {
                getUserMedia(video_constraints,
                    function (newStream) {

                        localStream = newStream;
                        localVideo.src = URL.createObjectURL(newStream);

                        cb(null);
                    },
                    function (err) {
                        cb(err);
                    }
                );
            },

            /**
             * Gracefully Ends the WebRTC Peer Connection. When any peer wants to end the call, it must call this function.
             * It is the responsibility of application to inform other peer about ending of the call. Application would
             * clean or change the UI itself. Both the peers should call this function to end the call.
             * This function cleans many variables and also stop all the local streams so that camera and screen media
             * (if accessed) would be stopped. Finally, it closes the peer connection.
             *
             */
            endConnection: function () {
                isStarted = false;
                isInitiator = false;

                console.log(localStream);

                if (localStream) {
                    localStream.stop();
                }
                if (localStreamScreen) {
                    localStreamScreen.stop();
                }
                if (remoteStream) {
                    remoteStream.stop();
                    remoteVideo.src = null;
                    remoteStream = null;
                }
                if (remoteStreamScreen) {
                    remoteStreamScreen.stop();
                    remoteVideoScreen.src = null;
                    remoteStreamScreen = null;
                }

                console.log(localStream);

                try {
                    pc.close();
                }catch(e){
                }

            },

            /**
             * Initializes the Signalling Service. Application can either initialize the signalling from this service or
             * by injecting the original Signalling Service and calling the initialize.
             *
             * Before starting any WebRTC call, application should give information about username of peers
             * and name of the room they join on the server.
             *
             * @param to Username of the other peer
             * @param from Username of this peer
             * @param roomName Name of the socket.io room which both peers must join for signalling
             */
            initializeSignalling: function (to, from, roomName) {
                Signalling.initialize(to, from, roomName);
            },

            /**
             * Application should call this function whenever the local peer wants to stop sharing the stream. This stops
             * the local screen stream and also removes the stream from the peer connection object. It is the responsibility
             * of application to call createAndSendOffer() function afterwards to let other peer know about this.
             */
            hideScreen: function () {
                localStreamScreen.stop();
                pc.removeStream(localStreamScreen);
            },

            /**
             * Adds the screen stream to peer connection object and video element. There is a complete screen sharing
             * service in this library which talks to screen sharing extension and returns the stream.
             *
             * Currently, screen sharing service is used by application and application get the stream using screen
             * sharing service and add it to peer connection object by calling this function
             *
             * todo: Use the screen sharing service inside this service and don't depend  on application
             *
             * @param stream Screen sharing stream
             */
            addStreamForScreen: function (stream) {
                localStreamScreen = stream;
                localVideoScreen.src = URL.createObjectURL(stream);

                pc.addStream(stream);
            },

            /**
             *  Application can check if the local stream is fetched or not by calling this function.
             *
             * @returns {*}
             */
            getLocalStream: function () {
                return localStream;
            },

            getScreenShared: function () {
                return screenShared;
            },

            /**
             * Application can set this to true for the peer who is the initiator of the call. Service must know
             * who is the initiator of the call. Initiator is the one who sends the offer to other peer.
             *
             * @param value Boolean variable to set the value for isInitiator
             */
            setInitiator: function (value) {
                isInitiator = value;
            },

            /**
             * Application can check if the peer is set as initiator or not by using this function. Initiator is
             * the one who sends the offer to other peer.
             * @returns {boolean}
             */
            getInitiator: function () {
                return isInitiator;
            },

            /**
             * Application can set this to true if the call or signalling has been started. This can be used to
             * put some controls i.e. do not send the candidates until the call is started
             *
             * @param value
             */
            setIsStarted: function (value) {
                isStarted = value;
            },

            /**
             * Application can check if the call or signalling has started or not. This can be used to put some controls.
             * i.e. do not send the candidates until the call is started
             *
             * @returns {boolean}
             */
            getIsStarted: function () {
                return isStarted;
            },

            increasePCIndex: function () {
                pcIndex++;
            },

            getPcIndex: function () {
                return pcIndex;
            },

            setIsChannelReady: function (value) {
                isChannelReady = value;
            },

            getIsChannelReady: function () {
                return isChannelReady;
            },

            setIJoinLate: function (value) {
                iJoinLate = value;
            },

            getIJoinLate: function () {
                return iJoinLate;
            },

            stopLocalStream: function () {
                localStream.stop();
            }
        };

        /**
         * Handle Ice Candidate and send it to other peer. This callback is called from within the peer connection object
         * whenever there are candidates available. We need to send each candidate to remote peer. For this, we use
         * signalling service of this library. Refer to the Signalling Service for more information on signalling.
         *
         * This function is not exposed to application and is handled by library itself.
         *
         * @param event holds the candidate
         */
        function handleIceCandidate(event) {
            if (event.candidate) {
                Signalling.sendMessage({
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            } else {
                //console.log('End of candidates.');
            }
        }

        /**
         * Set Local Description and send it to other peer. This callback function is called by createOffer()
         * function of the peer connection object. We need to set the Local Description in peer connection object
         * and then send it to the other peer too. Signalling service is used to send it to other peer. Refer to
         * Signalling service for more information on it.
         *
         * @param sessionDescription description about the session
         */
        function setLocalAndSendMessage(sessionDescription) {
            // Set Opus as the preferred codec in SDP if Opus is present.
            pc.setLocalDescription(sessionDescription);
            //console.log('setLocalAndSendMessage sending message' , sessionDescription);
            Signalling.sendMessage(sessionDescription);
        }

        /**
         * Handle the Create Offer Error. This callback function is called by createOffer() function of the
         * peer connection object whenever there is an error while creating the offer.
         *
         * @param error information about the error which occurred while creating offer
         */
        function handleCreateOfferError(error) {
            console.log('createOffer() error: ', error);
        }

        /**
         * Handle the remote stream. This call back function is used to handle the streams sent by the remote peer.
         * Currently, we have two types of streams to hold: video streams, audio stream and screen sharing stream. This
         * function takes care of handling of all stream and assigning them to correct video or audio element.
         *
         * When screen is shared it broadcasts 'screenShared' to the application. Application is responsible
         * to listen to that message and change the UI accordingly i.e. show video element
         *
         * @param event holds the stream sent by the remote peer
         */
        function handleRemoteStreamAdded(event) {
            if (!remoteStream) {
                remoteVideo.src = URL.createObjectURL(event.stream);
                remoteStream = event.stream;
            } else {
                remoteVideoScreen.src = URL.createObjectURL(event.stream);
                remoteStreamScreen = event.stream;
                screenShared = true;
            }
        }

        /**
         * Handle the remote peer stream removal. This callback function is used to handle the situation when remote
         * peer removes any stream i.e. stops screen sharing. This function takes care of knowing which stream has
         * been removed.
         *
         * When screen is removed it broadcasts 'screenShared' to the application. Application is responsible
         * to listen to that message and change the UI accordingly i.e. hide video element
         *
         * @param event
         */
        function handleRemoteStreamRemoved(event) {
            console.log(event);
            if(typeof remoteStreamScreen != 'undefined') {
                remoteStreamScreen.stop();
                remoteStreamScreen = null;
                screenShared = false;
            }
            else {
                remoteStreamScreen.stop();
                remoteStream.stop();

                remoteStreamScreen = null;
                remoteStream = null;
            }
        }

        /**
         * This callback function is used to handle the message sent by other peer. The message is sent using data channel
         * of WebRTC. It broadcasts this message to the application so that application can use the message.
         *
         * @param event contains the data sent by other peer
         */
        function handleMessage(event) {
            //trace('MESSAGE GOT: ' + event.data);
            //document.getElementById("dataChannelReceive").value = event.data;

            message = event.data;

            $rootScope.$broadcast("dataChannelMessageReceived");

        }

        /**
         * This callback function is used to handle the sendChannel's state whether it is opened or closed.
         *
         * todo: look for more documentation of this from WebRTC
         */
        function handleSendChannelStateChange() {
            var readyState = sendChannel.readyState;
            //trace('Send channel state is: ' + readyState);
        }

        /**
         * This callback function is called by WebRTC whenever the receiving channel is opened. This receiving channel
         * is the channel through which data travels.
         *
         * @param event holds the channel
         */
        function gotReceiveChannel(event) {
            //trace('Receive Channel Callback');
            sendChannel = event.channel;
            sendChannel.onmessage = handleMessage;
            sendChannel.onopen = handleReceiveChannelStateChange;
            sendChannel.onclose = handleReceiveChannelStateChange;
        }

        /**
         * This is used to handle the situation when receive channel is opened or closed. Application should
         * modify the UI depending on whether the data channel is opened or not.
         *
         * todo: notify the change to application using a broadcast
         */
        function handleReceiveChannelStateChange() {
            var readyState = sendChannel.readyState;
            //trace('Receive channel state is: ' + readyState);
        }


    });

'use strict';

/**
 * This is collection of configuration services used in WebRTC Connection. All the services use
 * them to create peer connection. Application can change some of the configurations like changing
 * ICE Server URLs by injecting the concerned service
 */

angular.module('kiboRtc.services')

/**
 * This returns the array of ICE Servers used by WebRTC when peers are behind the proxies and
 * direct connection is impossible.
 *
 * todo: Add the function addICEServer which should take JSON array or JSON object as input
 */
    .factory('pc_config', function () {
        /*
         return pc_config = {'iceServers': [createIceServer('stun:stun.l.google.com:19302', null, null),
         createIceServer('stun:stun.anyfirewall.com:3478', null, null),
         createIceServer('turn:turn.bistri.com:80?transport=udp', 'homeo', 'homeo'),
         createIceServer('turn:turn.bistri.com:80?transport=tcp', 'homeo', 'homeo'),
         createIceServer('turn:turn.anyfirewall.com:443?transport=tcp', 'webrtc', 'webrtc')
         ]};
         */

        return {
            'iceServers': [{
                url: 'turn:cloudkibo@162.243.217.34:3478?transport=udp', username: 'cloudkibo',
                credential: 'cloudkibo'
            },
                {url: 'stun:stun.l.google.com:19302', username: null, credential: null},
                {url: 'stun:stun.anyfirewall.com:3478', username: null, credential: null},
                {url: 'turn:turn.bistri.com:80?transport=udp', username: 'homeo', credential: 'homeo'},
                {url: 'turn:turn.bistri.com:80?transport=tcp', username: 'homeo', credential: 'homeo'},
                {url: 'turn:turn.anyfirewall.com:443?transport=tcp', username: 'webrtc', credential: 'webrtc'}
            ]
        };

        /*
         {url: 'turn:cloudkibo@162.243.217.34:3478?transport=udp', username: 'cloudkibo',
         credential: 'cloudkibo'}
         */
    })

/**
 * Configurations for Reliable Data Channel Connection
 *
 * NOTE: Applications should not use them directly
 *
 * todo: write more documentation from WebRTC official documentation for this
 */
    .factory('pc_constraints', function () {
        return {'optional': [{'DtlsSrtpKeyAgreement': true}, {'RtpDataChannels': true}]};
    })

/**
 * Session Description Protocol Constraints
 *
 * NOTE: Applications should not use them directly
 */
    .factory('sdpConstraints', function () {
        return {
            'mandatory': {
                'OfferToReceiveAudio': true,
                'OfferToReceiveVideo': true
            }
        };
    })

/**
 * Video Constraints for getUserMedia() of WebRTC API
 *
 * todo: add the function setVideoConstraints
 */

    .factory('video_constraints', function () {
        return {video: true, audio: false};
    })

/**
 * Audio Constraints for getUserMedia() of WebRTC API
 *
 * todo: add the function setVideoConstraints
 */

    .factory('audio_constraints', function () {
        return {video: false, audio: true};
    });

'use strict';

/**
 * This service is used to communicate with screen sharing extension on behalf of application. Application
 * must use the extension code provided by our library to use when creating its own extension. It will
 * check if the extension is installed or not. It will also ask for the sourceId from the extension to know
 * which window user wants to share. It can also tell the application if the user denied the access to screen.
 *
 * todo: this service should also contain the code to install the extension in-line
 * todo: this service should not be used by application directly, other webrtc service must depend on it
 *
 * NOTE: Following code was taken from the example of Muaz Khan, it has been converted from plain javascript to
 * angularjs code
 */
angular.module('kiboRtc.services')
    .factory('ScreenShare', function ScreenShare($rootScope, $window, pc_config, pc_constraints, sdpConstraints, video_constraints, Signalling) {

        // todo need to check exact chrome browser because opera also uses chromium framework
        var isChrome;

        var screenCallback;             /* Hold the callback function for a while as extension reply may take some time */

        var chromeMediaSource;          /* chromeMediaSource holds what screen user wants to share */

        /**
         * this statement defines getUserMedia constraints that will be used to capture content of screen
         *
         * @type {{mandatory: {chromeMediaSource: *, maxWidth: number, maxHeight: number, minAspectRatio: number}, optional: Array}}
         */
        var screen_constraints = {
            mandatory: {
                chromeMediaSource: chromeMediaSource,
                maxWidth: 1920,
                maxHeight: 1080,
                minAspectRatio: 1.77
            },
            optional: []
        };

        /**
         * it is the session that we want to be captured audio must be false
         *
         * @type {{audio: boolean, video: {mandatory: {chromeMediaSource: *, maxWidth: number, maxHeight: number, minAspectRatio: number}, optional: Array}}}
         */
        var session = {
            audio: false,
            video: screen_constraints
        };

        var sourceId;                   /* Screen object that user wants to share */

        return {

            /**
             * Application must initialize the service before using it for screen sharing.
             *
             * This function also listens to the messages sent to us by ScreenSharing Extension. It should be called by
             * the application at beginning with initialize() function.
             */
            initialize: function () {
                // todo need to check exact chrome browser because opera also uses chromium framework
                isChrome = !!navigator.webkitGetUserMedia;

                chromeMediaSource = 'screen';

                // listening to messages sent to us be Screen Sharing Extension.
                window.addEventListener('message', function (event) {
                    if (event.origin != window.location.origin) {
                        return;
                    }

                    onMessageCallback(event.data);
                });
            },

            /**
             * This function communicates with extension to get the screen source id. When user wants to share screen
             * he/she is asked if he/she wants to share full screen or just one of the open windows. Source Id is
             * to recognize which window user has chosen to share
             *
             * @param callback returns the source-id or PermissionDeniedError
             */
            getSourceId: function (callback) {
                if (!callback) throw '"callback" parameter is mandatory.';
                screenCallback = callback;
                $window.postMessage('get-sourceId', '*');
            },

            /**
             * This function tries to communicate with the extension to know its availability. It sends the message
             * "are-you-there" to extension and waits for 2 seconds and if there is no reply it assumes that extension
             * is not installed. Application is responsible for showing the option to install the extension if this
             * function returns false
             *
             * @param callback
             */
            isChromeExtensionAvailable: function (callback) {
                if (!callback) return;

                if (chromeMediaSource == 'desktop') callback(true);

                // ask extension if it is available
                $window.postMessage('are-you-there', '*');

                setTimeout(function () {
                    if (chromeMediaSource == 'screen') {
                        callback(false);
                    } else {
                        callback(true);
                        screen_constraints.mandatory.chromeMediaSource = 'desktop';
                    }
                }, 2000);

            },

            /**
             * Returns the object of screen_constraints
             *
             * @returns {{mandatory?: {chromeMediaSource: *, maxWidth: number, maxHeight: number, minAspectRatio: number}, : Array}}
             */
            screen_constraints: function () {
                return screen_constraints;
            },

            /**
             * Returns the the object of session. Audio should be false for screen sharing
             *
             * @returns {{audio: boolean, video: {mandatory?: {chromeMediaSource: *, maxWidth: number, maxHeight: number, minAspectRatio: number}, : Array}}}
             */
            session: function () {
                return session;
            },

            /**
             * If the returns "screen" it means extension is not installed, if it returns "Desktop" it means it is
             * installed
             *
             * @returns {*}
             */
            getChromeMediaSource: function () {
                return chromeMediaSource;
            },

            /**
             * Returns the source id of the screen object which is to be shared
             *
             * @returns {*}
             */
            getSourceIdValue: function () {
                return sourceId;
            },

            /**
             * It sets the source id in screen_constraints which is used by geUserMedia() Element
             */
            setSourceIdInConstraints: function () {
                screen_constraints.mandatory.chromeMediaSourceId = sourceId;
                session.video = screen_constraints;
            }

        };

        /**
         * It handles the messages sent from the screen sharing extension. Extension
         * can send 3 types of messages: PermissionDeniedError (user denies to share screen),
         * kiboconnection-extension-loaded (extension informs its availability) and sourceId
         * (the screen object user has selected to share)
         *
         * @param data message sent by screen share extension
         * @returns {*}
         */
        function onMessageCallback (data) {
            //console.log('chrome message', data);

            // "cancel" button is clicked
            if (data == 'PermissionDeniedError') {
                chromeMediaSource = 'PermissionDeniedError';
                if (screenCallback) return screenCallback('PermissionDeniedError');
                else throw new Error('PermissionDeniedError');
            }

            // extension notified its presence
            if (data == 'kiboconnection-extension-loaded') {
                chromeMediaSource = 'desktop';
            }

            // extension shared temp sourceId
            if (data.sourceId) {
                sourceId = data.sourceId;
                if (screenCallback) screenCallback(data.sourceId);
            }
        }


    });

'use strict';

/**
 * This AngularJS service is used by all other WebRTC services to do signalling using socket.io.
 * For this, peers seeking WebRTC call should join the same room on socket.io server. Each peer
 * should know its own username and other peer's username. WebRTC services in this library mainly use
 * this module to send offer, answer and candidates. Server side implementation should be simple
 * and according to message types it sends. Developer is responsible for giving username to the
 * peer which joins socket.io room on server. This username should be nickname for the given user
 * on socket.io room. Developer is also responsible to maintain the username on client side if required.
 * This service must be given the room name, sender's username and other party's username.
 *
 * NOTE: This services depends on Brain Ford's socket.io module. Application using this service must
 * also use the following socket.io library: (or just import it)
 * Name : angular-socket-io v0.6.1
 * Author : Brian Ford
 * Web Site : https://github.com/btford/angular-socket-io
 *
 * NOTE: Before starting any WebRTC call between two peers. You must initialize the required variables using
 * initialize method.
 *
 * @author Sojharo
 *
 */

angular.module('kiboRtc.services')
    .factory('Signalling', function Signalling($rootScope, socket) {

        var peer;           /* Username of the other peer */
        var username;       /* Username of this peer */
        var roomName;       /* Name of the socket.io room which peers join */

        return {

            /**
             * Before starting any WebRTC call, application should give information about username of peers
             * and name of the room they join on the server. Application can directly inject this service
             * and call this function or just call the initializeSignalling() in any WebRTC component service of this
             * library.
             *
             * @param to Username of the other peer
             * @param from Username of this peer
             * @param roomname Name of the socket.io room which both peers must join for signalling
             */
            initialize: function(to, from, roomname){
                peer = to;
                username = from;
                roomName = roomname;
            },

            /**
             * Sends the WebRTC signalling message to other peer in a WebRTC one-to-one call. This should be invoked
             * when sending the offer, answer or candidate objects to other peer. Refer to the handleIceCandidate()
             * in WebRTC Service which uses this function. You should write the server side code keeping structure of
             * message object in mind.
             *
             * @param message WebRTC signalling message, i.e. offer object, answer object, candidate objects etc
             */
            sendMessage: function(message){
                message = {msg:message};
                message.room = roomName;
                message.to = peer;
                message.username = username;
                //console.log('Client sending message: ', message);
                socket.emit('message', message);
            },

            /**
             * Sends the WebRTC signalling message to other peer in a WebRTC Data Channel Connection. This should be invoked
             * when sending the offer, answer or candidate objects to other peer. Refer to the handleIceCandidate()
             * in FileTransfer Service which uses this function. You should write the server side code keeping structure of
             * message object in mind. This is similar to sendMessage() but is implemented separate in case if one application
             * handles one peer connection for video call and other for data channel i.e. sending text messages or files.
             *
             * @param message WebRTC signalling message, i.e. offer object, answer object, candidate objects etc
             */
            sendMessageForDataChannel: function(message){
                message = {msg:message};
                message.room = roomName;
                message.to = peer;
                message.from = username;
                //console.log('Client sending message: ', message);
                socket.emit('messagefordatachannel', message);
            },

            /**
             * Sends the WebRTC signalling message to all peers in a WebRTC Conference. This should be invoked
             * when sending the offer, answer or candidate objects to all peers in a room. Refer to the handleIceCandidate()
             * in RTCConference Service which uses this function. You should write the server side code keeping structure of
             * message object in mind. Unlike, sendMessage() or SendMessageForDataChannel(), this does not use value for
             * message.to as the message is sent to everyone in a room.
             *
             * @param message WebRTC signalling message, i.e. offer object, answer object, candidate objects etc
             */
            sendMessageForMeeting: function (message) {
                message = {msg: message};
                message.room = roomName;
                message.username = username;
                //console.log('Client sending message: ', message);
                socket.emit('messageformeeting', message);
            },

            /**
             * Call this function when WebRTC call ends. This sets all the variables to null so that service does not
             * contain old information. You should again call the initialize function to start a new call.
             */
            destroy: function () {
                peer = null;
                username = null;
                roomName = null;
            }

        };

    });

'use strict';

/**
 * This is core WebRTC one-to-one video call service. It depends on the Signalling Service for doing signalling.
 * Furthermore, it uses services from configuration too. To use this, one should follow the WebRTC call procedure.
 * Here it is mostly same as standard procedure of a WebRTC call, but this service hides much of the details from
 * application. Before starting a video call, initialize function must be called and it must be given reference of
 * HTML video elements. This service automatically attaches the remote and local streams to these video elements.
 * It also takes care of both local and remote screen sharing streams. Application must call the functions in
 * following order:
 *
 * 1. Call the initialize() function when controller loads
 * 2. Call the initilizeSignalling() function if not called initialize() function of signalling service
 * 3. Capture the audio & video using captureUserMedia()
 * 4. If both peers has captured the camera then initiator would call the createPeerConnection() function
 * (NOTE: It is responsibility of the application to make sure both peers have got the media access. Application
 * may use the Signalling Service for this purpose)
 * 5. Initiator subsequently would call the createAndSendOffer() method
 * 6. Other peer would receive the offer and would call createPeerConnection()
 * 7. Subsequently, other peer would set the received SDP using setRemoteDescription()
 * (NOTE: For now, it is the responsibility of application to listen to "message" on socket.io for offer, answer
 * and other WebRTC signalling messages)
 * 8. Other peer would now call createAndSendAnswer() function
 * 9. Subsequently, service would automatically get the ICECandidates and send them to other peer
 * (NOTE: Also for ICECandidates, application should listen to "message" and invoke the setRemoteDescription() if
 * the message type is candidate)
 * 10. To end the call, application must call the endConnection() function, however it is application's responsibility
 * to clean the User Interface or change it accordingly.
 */

angular.module('kiboRtc.services')
    .factory('WebRTC', function WebRTC($rootScope, pc_config, pc_constraints, sdpConstraints, video_constraints, audio_constraints, Signalling) {

        var isInitiator = false;            /* It indicates which peer is the initiator of the call */
        var isStarted = false;              /* It indicates whether the WebRTC session is started or not */

        var localVideoStream;               /* It holds local camera stream */
        var localAudioStream;               /* It holds local audio stream */
        var localStreamScreen;              /* It holds local screen sharing stream */

        var pc;                             /* Peer Connection object */

        var remoteVideoStream = null;       /* It holds the other peer's camera stream */
        var remoteAudioStream = null;       /* It holds the other peer's audio stream */
        var remoteStreamScreen = null;      /* It holds the other peer's screen sharing stream */

        var localVideo;                     /* It is the HTML5 video element to hold local peer's video */
        var localVideoScreen;               /* It is the HTML5 video element to hold local screen sharing video */

        var remoteVideo;                    /* It is the HTML5 video element to hold other peer's video */
        var remoteAudio;                    /* It is the HTML5 audio element to hold other peer's audio */
        var remoteVideoScreen;              /* It is the HTML5 video element to hold other peer's screen sharing video */

        var screenShared = false;                   /* This boolean variable indicates if the other party has shared the screen */

        return {

            /**
             * Initialize the media elements. Application must call this function prior to making any WebRTC video
             * call. Application's UI must contain four video elements: two for local peer and two for remote peer.
             * Service would attach the local and incoming streams to these video elements by itself. You must get
             * the reference of these elements and pass them as parameters.
             *
             * @param localvideo Video Element to hold local peer's webcam video
             * @param localaudio Audio Element to hold local peer's audio
             * @param localvideoscreen Video Element to hold local peer's screen
             * @param remotevideo Video Element to hold remote peer's webcam video
             * @param remoteaudio Audio Element to hold remote peer's audio
             * @param remotevideoscreen Video Element to hold remote peer's screen
             */
            initialize: function (localvideo, localvideoscreen, remotevideo, remoteaudio, remotevideoscreen) {
                localVideo = localvideo;
                localVideoScreen = localvideoscreen;
                remoteVideo = remotevideo;
                remoteAudio = remoteaudio;
                remoteVideoScreen = remotevideoscreen;
            },

            /**
             * Creates Peer Connection and attaches the local stream to it. Application must call this function when
             * it knows that both the peers have got the local camera and mic access. In RTCPeerConnection(), we use
             * pc_config service from the configurations. Furthermore, service attaches some private callback functions
             * to some WebRTC connection events. Application doesn't need to care about them. This function assumes
             * that the local peer has got the camera and mic access and it adds the stream to peer connection object.
             *
             */
            createPeerConnection: function () {
                pc = new RTCPeerConnection(pc_config, {optional: []});//pc_constraints);
                pc.onicecandidate = handleIceCandidate;
                pc.onaddstream = handleRemoteStreamAdded;
                pc.onremovestream = handleRemoteStreamRemoved;
                pc.addStream(localAudioStream);
                if(localVideoStream)
                    pc.addStream(localVideoStream);
            },

            /**
             * Create and Send Offer to other peer. When initiator has got the camera access and has subsequently
             * made the peer connection object using createPeerConnection(), it must call this function now to send
             * the offer to other party. This function uses two private functions as callback to set local description
             * and handle the create offer error. Application doesn't need to care about these functions.
             *
             */
            createAndSendOffer: function () {
                pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
            },

            /**
             * Create and Send Answer to the peer who made the offer. When peer receives offer from the initiator,
             * it must call this function after setting the remote description. It uses the sdbConstraints from the
             * configurations. It has the callback functions to set local description and handle create answer error.
             * Application is responsible for listening the "message" socket.io event and then check if type is offer.
             * Subsequently, application must call this function to send answer.
             *
             */
            createAndSendAnswer: function () {
                pc.createAnswer(setLocalAndSendMessage, function (error) {
                    console.log(error)
                }, sdpConstraints);
            },

            /**
             * On receiving remote description from other peer with offer or answer message, application must call this
             * function to set the remote description to peer connection object.
             *
             * @param message It is the remote description sent to the local peer
             */
            setRemoteDescription: function (message) {
                pc.setRemoteDescription(new RTCSessionDescription(message));
            },

            /**
             * On receiving ice candidate from other peer, application must call this function to add this candidate
             * to local peer connection object. Application is responsible for listening the "message" socket.io event
             * and then check if type is candidate. Subsequently, appliction must call this function to set the remote
             * candidates.
             *
             * @param message It is the remote candidate sent to the local peer
             */
            addIceCandidate: function (message) {
                var candidate = new RTCIceCandidate({
                    sdpMLineIndex: message.label,
                    candidate: message.candidate
                });
                pc.addIceCandidate(candidate);
            },

            /**
             * Capture the User Media. Application must call this function to capture camera and mic. This function
             * uses video_constraints from the configurations. It sets the callback with null on success and err
             * on error. It attaches the local media stream to video element for the application.
             *
             * @param streamType Type of the stream to be captured. Possible values are "audio" or "video"
             * @param cb It is the callback which should be called with err if there was an error in accessing the media
             */
            captureUserMedia: function (streamType, cb) {
                var constraints;

                if (streamType == 'audio')
                    constraints = audio_constraints;
                else if (streamType == 'video')
                    constraints = video_constraints;
                else
                    return cb('Invalid stream type. Must be "audio" or "video"');

                getUserMedia(constraints,
                    function (newStream) {

                        if (streamType == 'audio') {
                            localAudioStream = newStream;
                        }
                        else if (streamType == 'video') {
                            localVideoStream = newStream;
                            localVideo.src = URL.createObjectURL(newStream);
                        }

                        cb(null);
                    },
                    function (err) {
                        cb(err);
                    }
                );
            },

            /**
             * Gracefully Ends the WebRTC Peer Connection. When any peer wants to end the call, it must call this function.
             * It is the responsibility of application to inform other peer about ending of the call. Application would
             * clean or change the UI itself. Both the peers should call this function to end the call.
             * This function cleans many variables and also stop all the local streams so that camera and screen media
             * (if accessed) would be stopped. Finally, it closes the peer connection.
             *
             */
            endConnection: function () {
                isStarted = false;
                isInitiator = false;

                //console.log(localStream);

                if (localVideoStream) {
                    localVideoStream.stop();
                }
                if(localAudioStream){
                    localAudioStream.stop();
                }
                if (localStreamScreen) {
                    localStreamScreen.stop();
                }
                if (remoteVideoStream) {
                    remoteVideoStream.stop();
                    remoteVideo.src = null;
                    remoteVideoStream = null;
                }
                if (remoteAudioStream) {
                    remoteAudioStream.stop();
                    remoteAudio.src = null;
                    remoteAudioStream = null;
                }
                if (remoteStreamScreen) {
                    remoteStreamScreen.stop();
                    remoteVideoScreen.src = null;
                    remoteStreamScreen = null;
                }

                //console.log(localStream);

                try {
                    pc.close();
                } catch (e) {
                }

            },

            /**
             * Initializes the Signalling Service. Application can either initialize the signalling from this service or
             * by injecting the original Signalling Service and calling the initialize.
             *
             * Before starting any WebRTC call, application should give information about username of peers
             * and name of the room they join on the server.
             *
             * @param to Username of the other peer
             * @param from Username of this peer
             * @param roomName Name of the socket.io room which both peers must join for signalling
             */
            initializeSignalling: function (to, from, roomName) {
                Signalling.initialize(to, from, roomName);
            },

            /**
             * Application should call this function whenever the local peer wants to stop sharing the stream. This stops
             * the local screen stream and also removes the stream from the peer connection object. It is the responsibility
             * of application to call createAndSendOffer() function afterwards to let other peer know about this.
             */
            hideScreen: function () {
                localStreamScreen.stop();
                pc.removeStream(localStreamScreen);
            },

            /**
             * Adds the screen stream to peer connection object and video element. There is a complete screen sharing
             * service in this library which talks to screen sharing extension and returns the stream.
             *
             * Currently, screen sharing service is used by application and application get the stream using screen
             * sharing service and add it to peer connection object by calling this function
             *
             * todo: Use the screen sharing service inside this service and don't depend  on application
             *
             * @param stream Screen sharing stream
             */
            addStreamForScreen: function (stream) {
                localStreamScreen = stream;
                localVideoScreen.src = URL.createObjectURL(stream);

                pc.addStream(stream);

            },

            /**
             *  Application can check if the local stream is fetched or not by calling this function.
             *
             * @returns {*}
             */
            getLocalAudioStream: function () {
                return localAudioStream;
            },

            /**
             * Application can set this to true for the peer who is the initiator of the call. Service must know
             * who is the initiator of the call. Initiator is the one who sends the offer to other peer.
             *
             * @param value Boolean variable to set the value for isInitiator
             */
            setInitiator: function (value) {
                isInitiator = value;
            },

            /**
             * Application can check if the peer is set as initiator or not by using this function. Initiator is
             * the one who sends the offer to other peer.
             * @returns {boolean}
             */
            getInitiator: function () {
                return isInitiator;
            },

            /**
             * Application can set this to true if the call or signalling has been started. This can be used to
             * put some controls i.e. do not send the candidates until the call is started
             *
             * @param value
             */
            setIsStarted: function (value) {
                isStarted = value;
            },

            /**
             * Application can check if the call or signalling has started or not. This can be used to put some controls.
             * i.e. do not send the candidates until the call is started
             *
             * @returns {boolean}
             */
            getIsStarted: function () {
                return isStarted;
            }
        };

        /**
         * Handle Ice Candidate and send it to other peer. This callback is called from within the peer connection object
         * whenever there are candidates available. We need to send each candidate to remote peer. For this, we use
         * signalling service of this library. Refer to the Signalling Service for more information on signalling.
         *
         * This function is not exposed to application and is handled by library itself.
         *
         * @param event holds the candidate
         */
        function handleIceCandidate(event) {
            if (event.candidate) {
                Signalling.sendMessage({
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            } else {
                //console.log('End of candidates.');
            }
        }

        /**
         * Set Local Description and send it to other peer. This callback function is called by createOffer()
         * function of the peer connection object. We need to set the Local Description in peer connection object
         * and then send it to the other peer too. Signalling service is used to send it to other peer. Refer to
         * Signalling service for more information on it.
         *
         * @param sessionDescription description about the session
         */
        function setLocalAndSendMessage(sessionDescription) {
            // Set Opus as the preferred codec in SDP if Opus is present.
            pc.setLocalDescription(sessionDescription);
            //console.log('setLocalAndSendMessage sending message' , sessionDescription);
            Signalling.sendMessage(sessionDescription);
        }

        /**
         * Handle the Create Offer Error. This callback function is called by createOffer() function of the
         * peer connection object whenever there is an error while creating the offer.
         *
         * @param error information about the error which occurred while creating offer
         */
        function handleCreateOfferError(error) {
            console.log('createOffer() error: ', error);
        }

        /**
         * Handle the remote stream. This call back function is used to handle the streams sent by the remote peer.
         * Currently, we have two types of streams to hold: video streams, audio stream and screen sharing stream. This
         * function takes care of handling of all stream and assigning them to correct video or audio element.
         *
         * When screen is shared it broadcasts 'screenShared' to the application. Application is responsible
         * to listen to that message and change the UI accordingly i.e. show video element
         *
         * @param event holds the stream sent by the remote peer
         */
        function handleRemoteStreamAdded(event) {
            if(event.stream.getAudioTracks().length){
                remoteAudio.src = URL.createObjectURL(event.stream);
                remoteAudioStream = event.stream;
            }

            if(event.stream.getVideoTracks().length){
                if (!remoteVideoStream) {
                    remoteVideo.src = URL.createObjectURL(event.stream);
                    remoteVideoStream = event.stream;
                } else {
                    remoteVideoScreen.src = URL.createObjectURL(event.stream);
                    remoteStreamScreen = event.stream;
                    $rootScope.$broadcast('screenShared');
                }
            }
        }

        /**
         * Handle the remote peer stream removal. This callback function is used to handle the situation when remote
         * peer removes any stream i.e. stops screen sharing. This function takes care of knowing which stream has
         * been removed.
         *
         * When screen is removed it broadcasts 'screenShared' to the application. Application is responsible
         * to listen to that message and change the UI accordingly i.e. hide video element
         *
         * @param event
         */
        function handleRemoteStreamRemoved(event) {
            console.log(event);
            if (typeof remoteStreamScreen != 'undefined') {
                remoteStreamScreen.stop();
                remoteStreamScreen = null;
                $rootScope.$broadcast('screenRemoved');
            }
            else {
                remoteStreamScreen.stop();
                remoteVideoStream.stop();

                remoteStreamScreen = null;
                remoteVideoStream = null;
            }
        }


    });
