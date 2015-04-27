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
