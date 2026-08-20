// ============================================================
// Online Sync Manager - Handles Puzzle Multiplayer Packets
// ============================================================

export class OnlineSync {
    static handleHostReceivedMessage(onlineMgr, clientPlayerId, packet) {
        if (packet.type === 'JOIN') {
            const alreadyExists = !!onlineMgr.roomData.players[clientPlayerId];
            onlineMgr.roomData.players[clientPlayerId] = packet.player;
            if (!alreadyExists) {
                const actionStr = onlineMgr.inGame ? 'подключился к игре' : 'вошел в лобби';
                onlineMgr.showToast(`👤 Игрок "${packet.player.name}" ${actionStr}`, 'info');
            }
            onlineMgr.addSyncLog(`Игрок ${packet.player.name} вошел в лобби`);
            onlineMgr.broadcastRoomData();
        } else if (packet.type === 'RACE_PROGRESS') {
            if (onlineMgr.roomData.players[clientPlayerId]) {
                Object.assign(onlineMgr.roomData.players[clientPlayerId], packet);
                if (onlineMgr.roomData.mode === 'coop') {
                    onlineMgr.roomData.teamProgress = packet.progressPct;
                }
                onlineMgr.broadcast(packet);
                onlineMgr.updateOnlineHUD();
            }
        } else if (packet.type === 'COOP_DRAG') {
            packet.playerId = clientPlayerId;
            onlineMgr.broadcast(packet);
            if (onlineMgr.game && typeof onlineMgr.game.handleRemoteCoopDrag === 'function') {
                onlineMgr.game.handleRemoteCoopDrag(packet);
            }
        } else if (packet.type === 'COOP_MOVE') {
            onlineMgr.broadcast(packet);
            if (onlineMgr.game && typeof onlineMgr.game.handleRemoteCoopMove === 'function') {
                onlineMgr.game.handleRemoteCoopMove(packet);
            }
        } else if (packet.type === 'PLAYER_WIN') {
            if (onlineMgr.roomData.players[clientPlayerId]) {
                onlineMgr.roomData.players[clientPlayerId].won = true;
                onlineMgr.roomData.players[clientPlayerId].surrendered = !!packet.isSurrendered;
            }
            onlineMgr.broadcast(packet);
            onlineMgr.handlePlayerWin(packet);
        } else if (packet.type === 'LEAVE') {
            const oldPlayer = onlineMgr.roomData?.players?.[clientPlayerId];
            if (oldPlayer) {
                const actionStr = onlineMgr.inGame ? 'вышел из игры' : 'покинул лобби';
                onlineMgr.showToast(`🚪 Игрок "${oldPlayer.name}" ${actionStr}`, 'danger');
            }
            delete onlineMgr.roomData.players[clientPlayerId];
            onlineMgr.broadcastRoomData();
        } else if (packet.type === 'ACTION_REQUEST') {
            if (onlineMgr.currentVote) {
                onlineMgr.addSyncLog(`Уже идет голосование за ${onlineMgr.currentVote.actionType}`);
                return;
            }
            onlineMgr.currentVote = {
                actionType: packet.actionType,
                requesterId: clientPlayerId,
                requesterName: onlineMgr.roomData.players[clientPlayerId]?.name || 'Участник',
                votes: { [clientPlayerId]: true }
            };
            onlineMgr.broadcast({
                type: 'VOTING_STARTED',
                actionType: packet.actionType,
                requesterId: clientPlayerId,
                requesterName: onlineMgr.currentVote.requesterName
            });
            if (clientPlayerId !== onlineMgr.playerId) {
                onlineMgr.showVoteDialog(packet.actionType, clientPlayerId, onlineMgr.currentVote.requesterName);
            }
            onlineMgr.checkVoteResult();
        } else if (packet.type === 'CAST_VOTE') {
            if (onlineMgr.currentVote && onlineMgr.currentVote.actionType === packet.actionType) {
                onlineMgr.currentVote.votes[clientPlayerId] = packet.vote;
                onlineMgr.checkVoteResult();
            }
        }
    }

    static handleClientReceivedMessage(onlineMgr, packet) {
        if (packet.type === 'ROOM_DATA') {
            const oldPlayers = onlineMgr.roomData?.players || {};
            const newPlayers = packet.roomData.players || {};
            for (const id in newPlayers) {
                if (id !== onlineMgr.playerId && !oldPlayers[id]) {
                    const actionStr = onlineMgr.inGame ? 'подключился к игре' : 'вошел в лобби';
                    onlineMgr.showToast(`👤 Игрок "${newPlayers[id].name}" ${actionStr}`, 'info');
                }
            }
            for (const id in oldPlayers) {
                if (id !== onlineMgr.playerId && !newPlayers[id]) {
                    const actionStr = onlineMgr.inGame ? 'вышел из игры' : 'покинул лобби';
                    onlineMgr.showToast(`🚪 Игрок "${oldPlayers[id].name}" ${actionStr}`, 'danger');
                }
            }

            onlineMgr.roomData = packet.roomData;
            onlineMgr.gameMode = packet.roomData.mode;
            if (!onlineMgr.inGame) {
                const playerList = document.getElementById('pzPlayerList');
                if (!playerList) {
                    onlineMgr.renderLobbyUI();
                } else {
                    onlineMgr.updateLobbyPlayerList();
                    const previewImg = document.getElementById('pzPreviewImg');
                    if (previewImg && packet.roomData.postUrl) {
                        previewImg.style.backgroundImage = `url('${packet.roomData.postUrl}')`;
                    }
                    const piecesInfo = document.getElementById('pzPiecesInfoText');
                    if (piecesInfo && packet.roomData.targetPieces) {
                        if (packet.roomData.aspectRatio && onlineMgr.game) {
                            onlineMgr.game.aspectRatio = packet.roomData.aspectRatio;
                        }
                        const target = packet.roomData.targetPieces;
                        if (onlineMgr.game && typeof onlineMgr.game.calculateGrid === 'function') {
                            const { cols: c, rows: r } = onlineMgr.game.calculateGrid(target, onlineMgr.game.aspectRatio || 1.0);
                            piecesInfo.textContent = `${c * r} деталей (${c}x${r})`;
                        } else {
                            piecesInfo.textContent = `${target} деталей`;
                        }
                    }
                    onlineMgr.updateLobbyPuzzleIdPill();
                }
            }
            if (packet.roomData.status === 'playing' && !onlineMgr.inGame) {
                onlineMgr.startGameFromData(packet.roomData);
            }
        } else if (packet.type === 'START_GAME') {
            onlineMgr.roomData = packet.roomData;
            onlineMgr.startGameFromData(packet.roomData);
        } else if (packet.type === 'RACE_PROGRESS') {
            if (onlineMgr.roomData?.players[packet.playerId]) {
                Object.assign(onlineMgr.roomData.players[packet.playerId], packet);
                if (onlineMgr.roomData.mode === 'coop') {
                    onlineMgr.roomData.teamProgress = packet.progressPct;
                }
                onlineMgr.updateOnlineHUD();
            }
        } else if (packet.type === 'COOP_MOVE') {
            if (packet.playerId !== onlineMgr.playerId && onlineMgr.game && typeof onlineMgr.game.handleRemoteCoopMove === 'function') {
                onlineMgr.game.handleRemoteCoopMove(packet);
            }
        } else if (packet.type === 'COOP_DRAG') {
            if (packet.playerId !== onlineMgr.playerId && onlineMgr.game && typeof onlineMgr.game.handleRemoteCoopDrag === 'function') {
                onlineMgr.game.handleRemoteCoopDrag(packet);
            }
        } else if (packet.type === 'PLAYER_WIN') {
            if (onlineMgr.roomData?.players[packet.winnerId]) {
                onlineMgr.roomData.players[packet.winnerId].won = true;
                onlineMgr.roomData.players[packet.winnerId].surrendered = !!packet.isSurrendered;
            }
            onlineMgr.handlePlayerWin(packet);
        } else if (packet.type === 'RETURN_TO_LOBBY') {
            onlineMgr.handleReturnToLobby(packet.roomData);
        } else if (packet.type === 'LEAVE' || packet.type === 'ROOM_CLOSED') {
            if (onlineMgr.roomData && (packet.playerId === onlineMgr.roomData.hostId || packet.type === 'ROOM_CLOSED')) {
                if (onlineMgr.active) {
                    onlineMgr.showToast('🛑 Комната закрыта организатором. Соединение разорвано.', 'danger');
                    if (typeof window.showConfirmModal === 'function') {
                        window.showConfirmModal('Комната закрыта', '🛑 Организатор закрыл комнату. Соединение отключено.', { hideCancel: true }).then(() => {
                            onlineMgr.leaveRoom();
                        });
                    } else {
                        onlineMgr.leaveRoom();
                    }
                }
            } else if (onlineMgr.roomData?.players) {
                const oldPlayer = onlineMgr.roomData.players[packet.playerId];
                if (oldPlayer) {
                    const actionStr = onlineMgr.inGame ? 'вышел из игры' : 'покинул лобби';
                    onlineMgr.showToast(`🚪 Игрок "${oldPlayer.name}" ${actionStr}`, 'danger');
                }
                delete onlineMgr.roomData.players[packet.playerId];
                if (onlineMgr.game && typeof onlineMgr.game.clearRemoteDrag === 'function') {
                    onlineMgr.game.clearRemoteDrag(packet.playerId);
                }
                onlineMgr.updateLobbyPlayerList();
                onlineMgr.updateOnlineHUD();
            }
        } else if (packet.type === 'VOTING_STARTED') {
            if (packet.requesterId !== onlineMgr.playerId) {
                onlineMgr.showVoteDialog(packet.actionType, packet.requesterId, packet.requesterName);
            }
        } else if (packet.type === 'EXECUTE_ACTION') {
            onlineMgr.showToast(`✅ Действие ${packet.actionType === 'RESTART' ? 'перезапуск' : 'автосбор'} одобрено командой!`, 'success');
            onlineMgr.executeAction(packet.actionType);
        } else if (packet.type === 'VOTING_REJECTED') {
            onlineMgr.showToast('Команда отклонила действие!', 'danger');
        }
    }
}
