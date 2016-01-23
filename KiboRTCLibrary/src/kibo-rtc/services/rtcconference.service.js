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
