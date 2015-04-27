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
