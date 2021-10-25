import React, { Component } from 'react';
import { Redirect } from 'react-router-dom';
import GameContainer from '../game/game-container';
import firebase from 'firebase/app';
import { FIREBASE_CONFIG } from './utils/utils';
import { Client } from 'colyseus.js';
import Modal from './component/modal';
import GameShop from './component/game-shop';
import GameInformations from './component/game-informations';

class Game extends Component {

    constructor(props){
        super(props);
        this.client = new Client(window.endpoint);
        window.langage = 'eng';
        this.container = React.createRef();

        this.state = {
          afterGameId: '',
          isSignedIn: false,
          connected: false,
          shopLocked: false,
          name: '',
          money: 0,
          player:{
            lastBattleResult: '',
            boardSize: 0,
            opponentName:'',
            shop:[],
            experienceManager:
              {
                level: 2,
                experience: 0,
                expNeeded: 2
              }
          },
          gameState:{
            roundTime: '',
            phase: '',
            players: {},
            stageLevel: 0,
            mapType: ''
          }
        };

        // Initialize Firebase
        if (!firebase.apps.length) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }

        firebase.auth().onAuthStateChanged(user => {
          this.setState({isSignedIn: !!user});
          this.uid = firebase.auth().currentUser.uid;
          this.currentPlayerId = this.uid;
          this.id = localStorage.getItem('lastRoomId');
          this.sessionId = localStorage.getItem('lastSessionId');

          try {
              firebase.auth().currentUser.getIdToken().then(token =>{
                  this.client.reconnect(this.id, this.sessionId)
                  .then(room=>{
                      this.initializeRoom(room);
                  })
                  .catch(err=>{
                    console.log(err);
                  });
              });
            
            } catch (e) {
              console.error("join error", e);
          }
      });
    }

    initializeRoom(room){
      this.room = room;
      this.room.state.players.onAdd = (player) => {
        this.gameContainer.initializePlayer(player);
        player.onChange = ((changes) => {
          if(player.id == this.currentPlayerId){
            this.setState({
              player: player
            });
          }
          if(player.id == this.uid){
            this.setState({
              name: player.name,
              money: player.money,
              shopLocked: player.shopLocked
            })
          }

          changes.forEach((change) => this.gameContainer.handlePlayerChange(change, player));
        });
      };
      this.room.state.players.onRemove = (player, key) => {
        this.gameContainer.onPlayerRemove(player, key)
      };
      this.setState({
        connected:true,
        gameState: room.state
      });

      this.room.state.onChange = (changes)=>{
        if(this.gameContainer && this.gameContainer.game){
          changes.forEach(change=>{
            switch (change.field) {
              case 'phase':
                this.gameContainer.game.scene.getScene('gameScene').updatePhase();
                break;
  
              default:
                break;
            }
          });
        }
        this.setState({
          gameState: this.room.state
        });
      }

      this.gameContainer = new GameContainer(this.container.current, this.uid, this.room);
      document.getElementById('game').addEventListener('player-click', this.gameContainer.onPlayerClick.bind(this.gameContainer));
      document.getElementById('game').addEventListener('drag-drop', this.gameContainer.onDragDrop.bind(this.gameContainer));
      document.getElementById('game').addEventListener('sell-drop', this.gameContainer.onSellDrop.bind(this.gameContainer));
      document.getElementById('leave-button').addEventListener('click', ()=>{
        this.gameContainer.closePopup();
        setTimeout(this.leaveGame.bind(this), 500);
      });
    }

    leaveGame(){
      this.removeEventListeners();
      let savePlayers = [];
      this.gameContainer.game.destroy(true);
      this.room.state.players.forEach(player => savePlayers.push(this.gameContainer.transformToSimplePlayer(player)));

      firebase.auth().currentUser.getIdToken().then(token =>{
        this.client.create('after-game', {players:savePlayers, idToken:token}).then((room) => {
          this.room.leave();
          let id = room.id;
          localStorage.setItem('lastRoomId', id);
          localStorage.setItem('lastSessionId', room.sessionId);
          room.connection.close();
          this.setState({afterGameId: room.id});
          });
          //console.log('joined room:', room);
      }).catch((e) => {
        console.error('join error', e);
      });
    }

    removeEventListeners(){
      this.gameContainer.closePopup();
      document.getElementById('game').removeEventListener('player-click', this.gameContainer.onPlayerClick.bind(this.gameContainer));
      document.getElementById('game').removeEventListener('drag-drop', this.gameContainer.onDragDrop.bind(this.gameContainer));
      document.getElementById('game').removeEventListener('sell-drop', this.gameContainer.onSellDrop.bind(this.gameContainer));
      document.getElementById('game').removeEventListener('leave-game', this.leaveGame.bind(this));
      document.getElementById('leave-button').removeEventListener('click', this.leaveGame.bind(this));
    }

    reconnect(){
      firebase.auth().currentUser.getIdToken().then(token =>{
        this.client.reconnect(this.id, this.sessionId)
        .then(room=>{
            this.initializeRoom(room);
        })
        .catch(err=>{
          this.setState({
            toLobby: true
          });
          console.log(err);
        });
      });
    }

    refreshClick() {
      this.room.send('refresh');
    }

    lockClick() {
      this.room.send('lock');
    }

    levelClick() {
        this.room.send('levelUp');
    }

    shopClick(index){
      this.room.send('shop', {'id': index});
    }

  render() {

    if(!this.state.isSignedIn){
      return <div>
      </div>;
    }
    if(this.state.toLobby){
      return <Redirect to='/lobby'/>;
    }
    if(this.state.afterGameId != ''){
      return <Redirect to='/after'/>;
    }
    if(!this.state.connected){
      return <div style={{display:'flex', position: 'absolute', top:'50%', left:'50%', marginLeft: '-300px', marginTop: '-150px', backgroundColor: 'rgba(255, 255, 255, .6)'}}>
          <div className="nes-container with-title is-centered" style={{width: '600px', height: '300px'}}>
            <p className="title">Game</p>
            <button className='nes-btn is-warning' onClick={this.reconnect.bind(this)}>Join Game</button>
        </div>
      </div>
    }
    else{
      return <div>
        <Modal/>
        <GameShop 
        levelExp={this.state.player.experienceManager.level} 
        experience={this.state.player.experienceManager.experience} 
        experienceNeeded={this.state.player.experienceManager.expNeeded} 
        money={this.state.money} refresh={this.refreshClick.bind(this)} 
        lock={this.lockClick.bind(this)} 
        shopLocked={this.state.shopLocked} 
        level={this.levelClick.bind(this)}
        shop={this.state.player.shop}
        shopClick={this.shopClick.bind(this)}/>
        <GameInformations
          boardSize={this.state.player.boardSize}
          maxBoardSize={this.state.player.experienceManager.level}
          opponent={this.state.player.opponentName}
          result={this.state.player.lastBattleResult}
          time={this.state.gameState.roundTime}
          turn={this.state.gameState.stageLevel}
        />
        <div id='game' ref={this.container} style={{
          maxHeight:'100vh'
        }}>
        </div>
      </div>
      
    }
  }
}
export default Game;
