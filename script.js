document.addEventListener('DOMContentLoaded', () => {
    // --- Globale variabler og konstanter ---
    const PAYOFFS = {
        R: 3, // Reward for mutual cooperation
        S: 0, // Sucker's payoff (cooperate, opponent defects)
        T: 5, // Temptation to defect
        P: 1, // Punishment for mutual defection
    };
    const C = 'C'; // Cooperate
    const D = 'D'; // Defect

    let strategies = {}; // Objekt for å holde alle strategifunksjoner
    let customAgents = {}; // Objekt for å holde brukerdefinerte agenter

    let gameState = {
        p1: { type: 'ai', strategyId: null, score: 0, history: [] },
        p2: { type: 'ai', strategyId: null, score: 0, history: [] },
        round: 0,
        maxRounds: 200,
        noise: 0, // Prosentandel
        isGameRunning: false,
        isAutoPlaying: false,
        autoPlayInterval: null,
        pendingHumanMove: null, // 'p1' or 'p2' if waiting for human
        isTournamentRunning: false,
    };

    // --- DOM Element Referanser ---
    const p1TypeSelect = document.getElementById('p1-type');
    const p1StrategySelect = document.getElementById('p1-strategy');
    const p2TypeSelect = document.getElementById('p2-type');
    const p2StrategySelect = document.getElementById('p2-strategy');
    const maxRoundsInput = document.getElementById('max-rounds');
    const noiseLevelInput = document.getElementById('noise-level');
    const noiseValueSpan = document.getElementById('noise-value');
    const startGameBtn = document.getElementById('start-game-btn');
    const resetAllBtn = document.getElementById('reset-all-btn');

    const agentNameInput = document.getElementById('agent-name');
    const agentFirstMoveSelect = document.getElementById('agent-first-move');
    const agentAfterCooperateSelect = document.getElementById('agent-after-cooperate');
    const agentAfterDefectSelect = document.getElementById('agent-after-defect');
    const addAgentBtn = document.getElementById('add-agent-btn');

    const gameSection = document.getElementById('game-section');
    const currentRoundSpan = document.getElementById('current-round');
    const totalRoundsSpan = document.getElementById('total-rounds');
    const currentNoiseSpan = document.getElementById('current-noise');
    const p1NameDisplay = document.getElementById('p1-name-display');
    const p1StrategyDisplay = document.getElementById('p1-strategy-display');
    const p1ScoreSpan = document.getElementById('p1-score');
    const p1AvgScoreSpan = document.getElementById('p1-avg-score');
    const p2NameDisplay = document.getElementById('p2-name-display');
    const p2StrategyDisplay = document.getElementById('p2-strategy-display');
    const p2ScoreSpan = document.getElementById('p2-score');
    const p2AvgScoreSpan = document.getElementById('p2-avg-score');
    const humanInputArea = document.getElementById('human-input-area');
    const humanPlayerNameSpan = document.getElementById('human-player-name');
    const humanCooperateBtn = document.getElementById('human-cooperate-btn');
    const humanDefectBtn = document.getElementById('human-defect-btn');
    const stepBtn = document.getElementById('step-btn');
    const step10Btn = document.getElementById('step-10-btn');
    const step100Btn = document.getElementById('step-100-btn');
    const runRestBtn = document.getElementById('run-rest-btn');
    const stopBtn = document.getElementById('stop-btn');
    const historyLog = document.getElementById('history-log');

    const tournamentAgentListDiv = document.getElementById('tournament-agent-list');
    const runTournamentBtn = document.getElementById('run-tournament-btn');
    const tournamentStatusP = document.getElementById('tournament-status');
    const tournamentResultsDiv = document.getElementById('tournament-results');
    const tournamentResultsBody = document.getElementById('tournament-results-body');

    // --- Hjelpefunksjoner ---
    const getRandomChoice = () => (Math.random() < 0.5 ? C : D);
    const applyNoise = (choice, noiseLevel) => {
        if (noiseLevel > 0 && Math.random() * 100 < noiseLevel) {
            return choice === C ? D : C; // Flip the choice
        }
        return choice;
    };

    // --- Forhåndsdefinerte AI Strategier ---
    strategies['ALL_C'] = { name: 'Alltid Samarbeid', func: (pHistory, oHistory) => C };
    strategies['ALL_D'] = { name: 'Alltid Svik', func: (pHistory, oHistory) => D };
    strategies['RANDOM'] = { name: 'Tilfeldig', func: (pHistory, oHistory) => getRandomChoice() };
    strategies['TFT'] = {
        name: 'Tit For Tat (TFT)',
        func: (pHistory, oHistory) => (oHistory.length === 0 ? C : oHistory[oHistory.length - 1].choice)
    };
    strategies['GRIM'] = {
        name: 'Grim Trigger',
        func: (pHistory, oHistory) => {
            // If opponent ever defected, always defect. Otherwise cooperate.
            if (oHistory.some(move => move.choice === D)) {
                return D;
            }
            return C;
        }
    };
    strategies['JOSS'] = { // Sleip TFT: Like TFT, but defects 10% of the time after cooperation
        name: 'Joss (Sleip TFT)',
        func: (pHistory, oHistory) => {
            if (oHistory.length === 0) return C;
            const opponentLastMove = oHistory[oHistory.length - 1].choice;
            if (opponentLastMove === C) {
                return Math.random() < 0.1 ? D : C; // 10% chance to defect anyway
            }
            return D; // Retaliate defect
        }
    };
    strategies['TFT2T'] = {
        name: 'Tit For Two Tats (TFT2T)',
        func: (pHistory, oHistory) => {
            if (oHistory.length < 2) return C; // Cooperate first two rounds
            const opponentLastMove = oHistory[oHistory.length - 1].choice;
            const opponentSecondLastMove = oHistory[oHistory.length - 2].choice;
            // Defect only if opponent defected twice in a row
            return (opponentLastMove === D && opponentSecondLastMove === D) ? D : C;
        }
    };
    strategies['GTFT'] = { // Generous TFT: Like TFT, but forgives D sometimes (e.g., 10% chance)
        name: 'Generous Tit For Tat (GTFT)',
        func: (pHistory, oHistory) => {
            if (oHistory.length === 0) return C;
            const opponentLastMove = oHistory[oHistory.length - 1].choice;
            if (opponentLastMove === D) {
                return Math.random() < 0.1 ? C : D; // 10% chance to forgive (Cooperate)
            }
            return C; // Cooperate if opponent cooperated
        }
    };
     strategies['TESTER'] = {
        name: 'Tester',
        func: (pHistory, oHistory, currentRound) => {
            // Special logic for early rounds
            if (currentRound === 1) return D; // Start defecting
            if (currentRound === 2) return C;
            if (currentRound === 3) return C;

            // Check if opponent retaliated on round 2 or 3 (after our round 1 D)
            const opponentRetaliated = oHistory.length >= 2 && (oHistory[1].choice === D || (oHistory.length >= 3 && oHistory[2].choice === D));

            if (opponentRetaliated) {
                // Play TFT if opponent retaliated
                return oHistory.length === 0 ? C : oHistory[oHistory.length - 1].choice;
            } else {
                // Exploit: Alternate D and C
                return (currentRound % 2 === 0) ? D : C; // Defect on even rounds (4, 6, ...), Coop on odd (5, 7, ...)
            }
        }
    };


    // --- Agentbygger Funksjonalitet ---
    function addCustomAgent() {
        const name = agentNameInput.value.trim();
        if (!name) {
            alert("Vennligst gi den egendefinerte agenten et navn.");
            return;
        }
        if (strategies[name] || customAgents[name]) {
             alert(`En agent med navnet "${name}" finnes allerede.`);
             return;
        }

        const firstMove = agentFirstMoveSelect.value;
        const afterCooperate = agentAfterCooperateSelect.value;
        const afterDefect = agentAfterDefectSelect.value;

        const agentFunc = (pHistory, oHistory) => {
            if (oHistory.length === 0) {
                return firstMove;
            }
            const opponentLastMove = oHistory[oHistory.length - 1].choice;
            return opponentLastMove === C ? afterCooperate : afterDefect;
        };

        const agentId = `CUSTOM_${name.replace(/\s+/g, '_')}`; // Lag en unik ID
        customAgents[agentId] = { name: name, func: agentFunc };

        // Oppdater UI
        populateStrategyDropdowns();
        populateTournamentAgentList();

        // Nullstill builder-felt
        agentNameInput.value = '';
        agentFirstMoveSelect.value = C;
        agentAfterCooperateSelect.value = C;
        agentAfterDefectSelect.value = D; // Sensible default?

        console.log(`Lagt til egendefinert agent: ${name}`);
    }

    // --- Spillogikk ---
    function getPlayerChoice(player, opponent) {
        if (gameState[player].type === 'human') {
            // Should be handled by human input buttons
            return null; // Indicate waiting for human
        } else {
            // AI choice
            const strategyId = gameState[player].strategyId;
            const strategyFunc = strategies[strategyId]?.func || customAgents[strategyId]?.func;
            if (strategyFunc) {
                try {
                    // Pass current round number for strategies that might need it (like Tester)
                     return strategyFunc(gameState[player].history, gameState[opponent].history, gameState.round + 1);
                } catch (error) {
                    console.error(`Error executing strategy ${strategyId} for ${player}:`, error);
                    return getRandomChoice(); // Fallback to random on error
                }
            } else {
                console.error(`Strategy function not found for ID: ${strategyId}`);
                return getRandomChoice(); // Fallback
            }
        }
    }

    function playRound(p1ChoiceProvided = null, p2ChoiceProvided = null) {
        if (gameState.round >= gameState.maxRounds || gameState.pendingHumanMove || gameState.isTournamentRunning) {
            stopAutoPlay(); // Stopp hvis maks runder nås eller venter på menneske
            updateUI(); // Sørg for at knapper er riktig deaktivert
            return;
        }

        let p1Choice = p1ChoiceProvided !== null ? p1ChoiceProvided : getPlayerChoice('p1', 'p2');
        let p2Choice = p2ChoiceProvided !== null ? p2ChoiceProvided : getPlayerChoice('p2', 'p1');

        // Håndter menneskelig input venting
        if (p1Choice === null) {
            gameState.pendingHumanMove = 'p1';
            updateUI();
            return; // Vent på input
        }
        if (p2Choice === null) {
            gameState.pendingHumanMove = 'p2';
            updateUI();
            return; // Vent på input
        }

        // Bruk støy
        const noiseLevel = gameState.noise;
        const noisyP1Choice = applyNoise(p1Choice, noiseLevel);
        const noisyP2Choice = applyNoise(p2Choice, noiseLevel);
        const p1Noisy = noisyP1Choice !== p1Choice;
        const p2Noisy = noisyP2Choice !== p2Choice;

        // Beregn poeng
        let p1RoundScore, p2RoundScore;
        if (noisyP1Choice === C && noisyP2Choice === C) {
            p1RoundScore = PAYOFFS.R;
            p2RoundScore = PAYOFFS.R;
        } else if (noisyP1Choice === C && noisyP2Choice === D) {
            p1RoundScore = PAYOFFS.S;
            p2RoundScore = PAYOFFS.T;
        } else if (noisyP1Choice === D && noisyP2Choice === C) {
            p1RoundScore = PAYOFFS.T;
            p2RoundScore = PAYOFFS.S;
        } else { // D vs D
            p1RoundScore = PAYOFFS.P;
            p2RoundScore = PAYOFFS.P;
        }

        // Oppdater poengsum og historikk
        gameState.p1.score += p1RoundScore;
        gameState.p2.score += p2RoundScore;
        gameState.round++;

        const p1HistoryEntry = { round: gameState.round, choice: p1Choice, noisyChoice: noisyP1Choice, wasNoisy: p1Noisy, score: p1RoundScore };
         const p2HistoryEntry = { round: gameState.round, choice: p2Choice, noisyChoice: noisyP2Choice, wasNoisy: p2Noisy, score: p2RoundScore };

        // Viktig: Lagre den *faktiske* (potensielt støyete) handlingen som motstanderen observerer
        // Men strategiene bør basere seg på hva *motstanderen gjorde* sist (noisyChoice)
        // Vi lagrer både original og noisy for visningens skyld.
        gameState.p1.history.push({ round: gameState.round, choice: p1Choice, noisyChoice: noisyP1Choice, wasNoisy: p1Noisy, score: p1RoundScore });
        gameState.p2.history.push({ round: gameState.round, choice: p2Choice, noisyChoice: noisyP2Choice, wasNoisy: p2Noisy, score: p2RoundScore });


        gameState.pendingHumanMove = null; // Input mottatt (eller ikke nødvendig)
        updateUI(); // Oppdater grensesnittet etter runden
    }

    function handleHumanChoice(choice) {
        if (!gameState.pendingHumanMove) return; // Ikke venter på input

        const humanPlayer = gameState.pendingHumanMove;
        if (humanPlayer === 'p1') {
            playRound(choice, null);
        } else { // humanPlayer === 'p2'
            // Need p1's choice first if it's AI
            const p1Choice = gameState.p1.type === 'ai' ? getPlayerChoice('p1', 'p2') : null;
            if (p1Choice !== null) { // Ensure p1 (if AI) has made its choice
                 playRound(p1Choice, choice);
            } else {
                 console.error("Error: Tried to process P2 human choice before P1 AI choice was determined.");
                 // Potentially need to re-evaluate logic if P1 is also human, though UI should prevent this state.
            }
        }
    }

    function startAutoPlay() {
        if (gameState.isAutoPlaying || gameState.pendingHumanMove || gameState.round >= gameState.maxRounds || gameState.isTournamentRunning) return;

        // Deaktiver andre spillknapper umiddelbart
        stepBtn.disabled = true;
        step10Btn.disabled = true;
        step100Btn.disabled = true;
        runRestBtn.disabled = true;
        stopBtn.disabled = false; // Aktiver stoppknappen

        gameState.isAutoPlaying = true;
        runRestBtn.textContent = 'Kjører...'; // Visuell indikasjon

        // Bruk en liten forsinkelse for å la UI oppdatere seg
        setTimeout(() => {
             gameState.autoPlayInterval = setInterval(() => {
                if (gameState.round < gameState.maxRounds && !gameState.pendingHumanMove && gameState.isAutoPlaying) {
                     playRound();
                 } else {
                     stopAutoPlay(); // Stopp hvis ferdig, venter, eller stoppet manuelt
                 }
             }, 100); // Juster hastighet her (f.eks. 100ms per runde)
        }, 50);
    }

    function stopAutoPlay() {
        if (gameState.autoPlayInterval) {
            clearInterval(gameState.autoPlayInterval);
            gameState.autoPlayInterval = null;
        }
        gameState.isAutoPlaying = false;
         runRestBtn.textContent = 'Kjør Resten'; // Tilbakestill knappetekst
        updateUI(); // Oppdater knapper basert på ny tilstand
    }


    // --- Turneringslogikk ---
    async function runTournament() {
        if (gameState.isGameRunning || gameState.isTournamentRunning) {
            alert("Kan ikke starte turnering mens et spill eller en annen turnering pågår.");
            return;
        }

        const selectedAgentCheckboxes = tournamentAgentListDiv.querySelectorAll('input[type="checkbox"]:checked');
        const selectedAgentIds = Array.from(selectedAgentCheckboxes).map(cb => cb.value);

        if (selectedAgentIds.length < 2) {
            alert("Vennligst velg minst to agenter for turneringen.");
            return;
        }

        gameState.isTournamentRunning = true;
        tournamentStatusP.textContent = "Starter turnering...";
        tournamentResultsDiv.classList.add('hidden'); // Skjul gamle resultater
        disableUIBeforeTournament(true);

        const tournamentMaxRounds = parseInt(maxRoundsInput.value, 10) || 200;
        const tournamentNoise = parseInt(noiseLevelInput.value, 10) || 0;
        const results = {}; // { agentId: { totalScore: 0, gamesPlayed: 0 } }

        // Initialiser resultater
        selectedAgentIds.forEach(id => {
             results[id] = { totalScore: 0, gamesPlayed: 0, name: strategies[id]?.name || customAgents[id]?.name || id };
        });

        const matchups = [];
        // Generer alle unike par (inkludert self-play)
        for (let i = 0; i < selectedAgentIds.length; i++) {
            for (let j = i; j < selectedAgentIds.length; j++) { // Start j fra i for å unngå duplikater og inkludere self-play
                 matchups.push([selectedAgentIds[i], selectedAgentIds[j]]);
            }
        }

        tournamentStatusP.textContent = `Kjører 0 / ${matchups.length} kamper...`;

        // Kjør kampene sekvensielt (med async/await for UI-oppdatering)
        for (let k = 0; k < matchups.length; k++) {
             const [id1, id2] = matchups[k];

             // Kjør en full simulering
             const gameResult = await simulateSingleGame(id1, id2, tournamentMaxRounds, tournamentNoise);

             // Oppdater totalscore for begge agenter
             results[id1].totalScore += gameResult.p1Score;
             results[id1].gamesPlayed++;
             // Unngå å telle self-play dobbelt for gamesPlayed
             if (id1 !== id2) {
                 results[id2].totalScore += gameResult.p2Score;
                 results[id2].gamesPlayed++;
             } else {
                  // For self-play, legg til scoren en gang til (spilleren får poengene fra begge sider av spillet mot seg selv)
                 // Alternativt, hvis man ser på gjennomsnitt *per kamp*, så er dette kanskje ikke nødvendig.
                 // La oss anta at vi vil ha total poengsum opptjent av agenten i turneringen.
                 results[id1].totalScore += gameResult.p2Score;
                 // gamesPlayed er allerede talt én gang.
             }


             // Oppdater status (bruk requestAnimationFrame for smidigere UI)
             await new Promise(resolve => requestAnimationFrame(resolve));
             tournamentStatusP.textContent = `Kjører ${k + 1} / ${matchups.length} kamper...`;
        }

        // Beregn gjennomsnitt og ranger resultater
        const finalResults = Object.entries(results).map(([id, data]) => {
             const avgScore = data.gamesPlayed > 0 ? (data.totalScore / (data.gamesPlayed * tournamentMaxRounds)) : 0;
             return { id, name: data.name, avgScore: avgScore.toFixed(3) }; // 3 desimaler
         });

        finalResults.sort((a, b) => b.avgScore - a.avgScore); // Sorter synkende

        // Vis resultater
        displayTournamentResults(finalResults);

        tournamentStatusP.textContent = "Turnering fullført!";
        gameState.isTournamentRunning = false;
        disableUIBeforeTournament(false); // Re-enable UI
    }

    // Simulerer et enkelt spill mellom to AIer uten å oppdatere hoved-UI
    async function simulateSingleGame(p1StrategyId, p2StrategyId, rounds, noise) {
         let p1Score = 0;
         let p2Score = 0;
         let p1History = [];
         let p2History = [];
         const p1StratFunc = strategies[p1StrategyId]?.func || customAgents[p1StrategyId]?.func;
         const p2StratFunc = strategies[p2StrategyId]?.func || customAgents[p2StrategyId]?.func;

         if (!p1StratFunc || !p2StratFunc) {
             console.error(`Strategy function missing for matchup: ${p1StrategyId} vs ${p2StrategyId}`);
             return { p1Score: 0, p2Score: 0 };
         }

         for (let round = 1; round <= rounds; round++) {
             // Få valg (Passer nåværende runde nummer)
             const p1Choice = p1StratFunc(p1History, p2History, round);
             const p2Choice = p2StratFunc(p2History, p1History, round);

             // Bruk støy
             const noisyP1Choice = applyNoise(p1Choice, noise);
             const noisyP2Choice = applyNoise(p2Choice, noise);
             const p1Noisy = noisyP1Choice !== p1Choice;
             const p2Noisy = noisyP2Choice !== p2Choice;


             // Beregn poeng
             let p1RoundScore, p2RoundScore;
             if (noisyP1Choice === C && noisyP2Choice === C) { p1RoundScore = PAYOFFS.R; p2RoundScore = PAYOFFS.R; }
             else if (noisyP1Choice === C && noisyP2Choice === D) { p1RoundScore = PAYOFFS.S; p2RoundScore = PAYOFFS.T; }
             else if (noisyP1Choice === D && noisyP2Choice === C) { p1RoundScore = PAYOFFS.T; p2RoundScore = PAYOFFS.S; }
             else { p1RoundScore = PAYOFFS.P; p2RoundScore = PAYOFFS.P; }

             p1Score += p1RoundScore;
             p2Score += p2RoundScore;

             // Lagre historikk (med noisy choice som motstanderen ser)
              p1History.push({ round: round, choice: p1Choice, noisyChoice: noisyP1Choice, wasNoisy: p1Noisy, score: p1RoundScore });
              p2History.push({ round: round, choice: p2Choice, noisyChoice: noisyP2Choice, wasNoisy: p2Noisy, score: p2RoundScore });

             // Liten pause for å unngå å fryse nettleseren på lange turneringer
             if (round % 100 === 0) {
                 await new Promise(resolve => setTimeout(resolve, 0));
             }
         }
         return { p1Score, p2Score };
     }


    function displayTournamentResults(results) {
        tournamentResultsBody.innerHTML = ''; // Tøm gamle resultater
        results.forEach((result, index) => {
            const row = tournamentResultsBody.insertRow();
            row.insertCell(0).textContent = index + 1; // Rank
            row.insertCell(1).textContent = result.name;
            row.insertCell(2).textContent = result.avgScore;
        });
        tournamentResultsDiv.classList.remove('hidden');
    }

    function disableUIBeforeTournament(disable) {
        // Deaktiver/aktiver konfigurasjon og spillkontroller
        [p1TypeSelect, p1StrategySelect, p2TypeSelect, p2StrategySelect, maxRoundsInput, noiseLevelInput, startGameBtn, resetAllBtn, addAgentBtn].forEach(el => el.disabled = disable);

        // Deaktiver/aktiver turneringslisten og knappen
         const checkboxes = tournamentAgentListDiv.querySelectorAll('input[type="checkbox"]');
         checkboxes.forEach(cb => cb.disabled = disable);
         runTournamentBtn.disabled = disable; // Styr denne separat i tournament logikk? Nei, OK her.


        // Hvis et spill pågår, må også de knappene håndteres
         if (gameState.isGameRunning) {
            [stepBtn, step10Btn, step100Btn, runRestBtn, stopBtn, humanCooperateBtn, humanDefectBtn].forEach(el => el.disabled = disable);
         }
    }


    // --- UI Oppdateringer ---
    function updateUI() {
        // Oppdater spillinfo
        currentRoundSpan.textContent = gameState.round;
        totalRoundsSpan.textContent = gameState.maxRounds;
        currentNoiseSpan.textContent = `${gameState.noise}%`;
        p1ScoreSpan.textContent = gameState.p1.score;
        p2ScoreSpan.textContent = gameState.p2.score;
        p1AvgScoreSpan.textContent = gameState.round > 0 ? (gameState.p1.score / gameState.round).toFixed(2) : '0.00';
        p2AvgScoreSpan.textContent = gameState.round > 0 ? (gameState.p2.score / gameState.round).toFixed(2) : '0.00';

        // Oppdater spillernavn og strategi
        p1NameDisplay.textContent = gameState.p1.type === 'human' ? 'Menneske' : 'AI';
        const p1StratName = strategies[gameState.p1.strategyId]?.name || customAgents[gameState.p1.strategyId]?.name || '?';
        p1StrategyDisplay.textContent = gameState.p1.type === 'ai' ? p1StratName : '-';
        p2NameDisplay.textContent = gameState.p2.type === 'human' ? 'Menneske' : 'AI';
        const p2StratName = strategies[gameState.p2.strategyId]?.name || customAgents[gameState.p2.strategyId]?.name || '?';
        p2StrategyDisplay.textContent = gameState.p2.type === 'ai' ? p2StratName : '-';


        // Oppdater historikklogg (vis siste 20)
        historyLog.innerHTML = ''; // Tøm først
        const historyToShow = gameState.p1.history.slice(-20); // Siste 20 runder
        historyToShow.reverse().forEach((p1Move, index) => {
            const p2Move = gameState.p2.history[gameState.p2.history.length - 1 - index]; // Få tilsvarende p2 trekk
            if (!p2Move) return; // Sikkerhetssjekk

            const p1ChoiceClass = p1Move.noisyChoice === C ? 'choice-C' : 'choice-D';
            const p2ChoiceClass = p2Move.noisyChoice === C ? 'choice-C' : 'choice-D';
            const p1NoiseIndicator = p1Move.wasNoisy ? ' <span class="noise-indicator">(Støy!)</span>' : '';
            const p2NoiseIndicator = p2Move.wasNoisy ? ' <span class="noise-indicator">(Støy!)</span>' : '';

             // Bruker `pre` tag inni div for enkel formatering/justering
             const entryDiv = document.createElement('div');
             entryDiv.classList.add('history-entry');
             // PadStart for å justere rundetall
             entryDiv.innerHTML = `<pre>Runde ${String(p1Move.round).padStart(3)}: P1 valgte <span class="${p1ChoiceClass}">${p1Move.noisyChoice}</span>${p1NoiseIndicator} (score ${p1Move.score}), P2 valgte <span class="${p2ChoiceClass}">${p2Move.noisyChoice}</span>${p2NoiseIndicator} (score ${p2Move.score})</pre>`;

            historyLog.appendChild(entryDiv);
        });


        // Håndter synlighet og tilstand for spillkontroller
        const gameHasStarted = gameState.isGameRunning;
        const gameIsOver = gameState.round >= gameState.maxRounds;
        const canAutoPlay = gameState.p1.type === 'ai' && gameState.p2.type === 'ai';

        gameSection.classList.toggle('hidden', !gameHasStarted);
        humanInputArea.classList.toggle('hidden', !gameState.pendingHumanMove);

        if (gameState.pendingHumanMove) {
            humanPlayerNameSpan.textContent = gameState.pendingHumanMove === 'p1' ? 'Spiller 1' : 'Spiller 2';
            humanCooperateBtn.disabled = false;
            humanDefectBtn.disabled = false;
        } else {
            humanCooperateBtn.disabled = true;
            humanDefectBtn.disabled = true;
        }

        // Aktiver/deaktiver knapper
        stepBtn.disabled = !gameHasStarted || gameIsOver || gameState.isAutoPlaying || !!gameState.pendingHumanMove || gameState.isTournamentRunning;
        step10Btn.disabled = !gameHasStarted || gameIsOver || !canAutoPlay || gameState.isAutoPlaying || gameState.isTournamentRunning;
        step100Btn.disabled = !gameHasStarted || gameIsOver || !canAutoPlay || gameState.isAutoPlaying || gameState.isTournamentRunning;
        runRestBtn.disabled = !gameHasStarted || gameIsOver || !canAutoPlay || gameState.isAutoPlaying || gameState.isTournamentRunning;
        stopBtn.disabled = !gameState.isAutoPlaying || gameState.isTournamentRunning;

        // Oppdater turneringsknapp-status basert på antall valgte agenter
         const selectedAgentsCount = tournamentAgentListDiv.querySelectorAll('input[type="checkbox"]:checked').length;
         runTournamentBtn.disabled = selectedAgentsCount < 2 || gameState.isGameRunning || gameState.isTournamentRunning;

        // Oppdater enable/disable for AI strategi dropdowns
         p1StrategySelect.disabled = gameState.p1.type !== 'ai' || gameState.isGameRunning || gameState.isTournamentRunning;
         p2StrategySelect.disabled = gameState.p2.type !== 'ai' || gameState.isGameRunning || gameState.isTournamentRunning;
    }

    // --- Initialisering ---
    function populateStrategyDropdowns() {
        const allStrategies = { ...strategies, ...customAgents };
        const optionsHtml = Object.entries(allStrategies)
            .map(([id, agent]) => `<option value="${id}">${agent.name}</option>`)
            .join('');

        p1StrategySelect.innerHTML = optionsHtml;
        p2StrategySelect.innerHTML = optionsHtml;

        // Prøv å beholde valgte strategier hvis mulig, ellers velg første
        if (gameState.p1.strategyId && allStrategies[gameState.p1.strategyId]) {
            p1StrategySelect.value = gameState.p1.strategyId;
        } else if (Object.keys(allStrategies).length > 0){
            p1StrategySelect.selectedIndex = 0; // Velg første som default
            gameState.p1.strategyId = p1StrategySelect.value; // Oppdater state
        }
         if (gameState.p2.strategyId && allStrategies[gameState.p2.strategyId]) {
            p2StrategySelect.value = gameState.p2.strategyId;
        } else if (Object.keys(allStrategies).length > 0){
            p2StrategySelect.selectedIndex = 0; // Velg første som default
            gameState.p2.strategyId = p2StrategySelect.value; // Oppdater state
        }
    }

    function populateTournamentAgentList() {
        const allStrategies = { ...strategies, ...customAgents };
        tournamentAgentListDiv.innerHTML = ''; // Tøm listen

        Object.entries(allStrategies).forEach(([id, agent]) => {
            const div = document.createElement('div');
            div.classList.add('tournament-agent-item');
            const checkboxId = `agent-checkbox-${id}`;
            div.innerHTML = `
                <input type="checkbox" id="${checkboxId}" value="${id}">
                <label for="${checkboxId}">${agent.name}</label>
            `;
            // Legg til event listener for å oppdatere turneringsknappen
            div.querySelector('input[type="checkbox"]').addEventListener('change', updateUI);
            tournamentAgentListDiv.appendChild(div);
        });
        updateUI(); // Sørg for at knappen er riktig enabled/disabled
    }


    function resetGame(fullReset = false) {
        stopAutoPlay();
        gameState = {
            p1: { type: p1TypeSelect.value, strategyId: p1StrategySelect.value, score: 0, history: [] },
            p2: { type: p2TypeSelect.value, strategyId: p2StrategySelect.value, score: 0, history: [] },
            round: 0,
            maxRounds: parseInt(maxRoundsInput.value, 10) || 200,
            noise: parseInt(noiseLevelInput.value, 10) || 0,
            isGameRunning: false,
            isAutoPlaying: false,
            autoPlayInterval: null,
            pendingHumanMove: null,
            isTournamentRunning: false, // Antar reset ikke skjer under turnering
        };

        // Behold spiller typer/strategier med mindre det er full reset
        if (fullReset) {
            p1TypeSelect.value = 'ai';
            p2TypeSelect.value = 'ai';
            maxRoundsInput.value = 200;
            noiseLevelInput.value = 0;
            noiseValueSpan.textContent = '0%';
             // Tilbakestill custom agents? Kanskje ikke ønskelig. La dem være.
             // populateStrategyDropdowns(); // Kalles uansett i initialize? Ja.
             // populateTournamentAgentList(); // Ja.
            tournamentResultsDiv.classList.add('hidden');
            tournamentStatusP.textContent = '';
        } else {
            // Bevar konfigurasjon, bare nullstill spilltilstand
            gameState.p1.type = p1TypeSelect.value;
            gameState.p1.strategyId = p1StrategySelect.value;
            gameState.p2.type = p2TypeSelect.value;
            gameState.p2.strategyId = p2StrategySelect.value;
             gameState.maxRounds = parseInt(maxRoundsInput.value, 10) || 200;
             gameState.noise = parseInt(noiseLevelInput.value, 10) || 0;
        }


        updateUI();
        console.log("Game state reset.");
    }

    function initializeApp() {
        console.log("Initializing Dilemma Lab...");
        // Sett opp event listeners
        p1TypeSelect.addEventListener('change', (e) => { gameState.p1.type = e.target.value; updateUI(); });
        p2TypeSelect.addEventListener('change', (e) => { gameState.p2.type = e.target.value; updateUI(); });
        p1StrategySelect.addEventListener('change', (e) => { gameState.p1.strategyId = e.target.value; });
        p2StrategySelect.addEventListener('change', (e) => { gameState.p2.strategyId = e.target.value; });
        maxRoundsInput.addEventListener('change', (e) => { gameState.maxRounds = parseInt(e.target.value, 10) || 200; updateUI(); });
        noiseLevelInput.addEventListener('input', (e) => {
            gameState.noise = parseInt(e.target.value, 10);
            noiseValueSpan.textContent = `${gameState.noise}%`;
            // Ikke kall updateUI() her for ytelse, kun ved change eller spillstart?
            // La oss kalle den for live feedback på støynivå i spillvisning.
            if (gameState.isGameRunning) updateUI();
        });
        noiseLevelInput.addEventListener('change', updateUI); // Oppdater når man slipper slideren

        startGameBtn.addEventListener('click', () => {
             resetGame(); // Nullstill score/historikk etc., behold innstillinger
             gameState.isGameRunning = true; // Marker spillet som startet
             // Sjekk om vi må vente på menneskelig input umiddelbart
             if (gameState.p1.type === 'human' || gameState.p2.type === 'human') {
                 playRound(); // Dette vil sette pendingHumanMove hvis nødvendig
             }
             updateUI(); // Vis spillseksjonen og oppdater knapper
        });
        resetAllBtn.addEventListener('click', () => resetGame(true));

        addAgentBtn.addEventListener('click', addCustomAgent);

        stepBtn.addEventListener('click', () => playRound());
        step10Btn.addEventListener('click', () => { for(let i=0; i<10; i++) playRound(); });
        step100Btn.addEventListener('click', () => { for(let i=0; i<100; i++) playRound(); });
        runRestBtn.addEventListener('click', startAutoPlay);
        stopBtn.addEventListener('click', stopAutoPlay);

        humanCooperateBtn.addEventListener('click', () => handleHumanChoice(C));
        humanDefectBtn.addEventListener('click', () => handleHumanChoice(D));

        runTournamentBtn.addEventListener('click', runTournament);


        // Initial populating
        populateStrategyDropdowns();
        populateTournamentAgentList();
        resetGame(true); // Start med en ren state og standardverdier
    }

    // --- Kjør Initialisering ---
    initializeApp();

}); // End DOMContentLoaded
