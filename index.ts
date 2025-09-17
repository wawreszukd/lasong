import { giveStar, getUserStats, resetDailyGivenStars, initializeDatabase, getTopStars, howMuchLeft, getAll } from "./handledb.ts";



const BOT_USERNAME = Deno.env.get("BOT_USERNAME");
const CHANNEL_NAME = Deno.env.get("CHANNEL_NAME");
const REFRESH_TOKEN = Deno.env.get("REFRESH_TOKEN");
const CLIENT_ID = Deno.env.get("CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("CLIENT_SECRET");
const TWITCH_WEBSOCKET_URL = 'wss://eventsub.wss.twitch.tv/ws';
const ADMINS = Deno.env.get("ADMINS")?.split(' ');
if(!ADMINS){
    throw new Error("Admins are not specified")
}
let botUserId: string;
let channelUserId: string;
let websocketSessionId: string;

async function handleExit() {
    resetDailyGivenStars();
    const currentOauthToken = Deno.env.get("OAUTH_TOKEN");
    if (currentOauthToken) {
        await updateENVAUTH(currentOauthToken);
    }
    Deno.exit(0);
}
const os = Deno.build.os;

if (os === "windows") {
    Deno.addSignalListener("SIGINT", handleExit);
    Deno.addSignalListener("SIGBREAK", handleExit);
} else {
    Deno.addSignalListener("SIGINT", handleExit);
    Deno.addSignalListener("SIGHUP", handleExit);
    Deno.addSignalListener("SIGTERM", handleExit);
}
async function updateENVAUTH(newValue: string) {
    try {
        const text = `REFRESH_TOKEN="${newValue}}"`
        Deno.writeTextFile("./.env", text)
    } catch (error) {
        console.error('Błąd podczas aktualizacji pliku .env:', error);
    }
}

export async function getMusicRequester() {
    const url = "https://api.streamelements.com/kappa/v2/songrequest/5d34c3a72d19d245b55e688a/playing";
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        const json = await response.json();
        return json.user?.username;
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function refreshToken() {
    const url = 'https://id.twitch.tv/oauth2/token';

    const data = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: REFRESH_TOKEN!,
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: data,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to refresh token');
        }

        const responseData = await response.json();
        Deno.env.set('OAUTH_TOKEN', responseData.access_token);
    } catch (error) {
        console.error('Error refreshing token:', error);
    }
}

async function validateToken() {
    const response = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { 'Authorization': `OAuth ${Deno.env.get("OAUTH_TOKEN")}` }
    });
    if (!response.ok) throw new Error("Token validation failed");
    return response.json();
}

async function getUserId(username: string) {
    const response = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
        headers: {
            'Client-ID': CLIENT_ID!,
            'Authorization': `Bearer ${Deno.env.get("OAUTH_TOKEN")}`
        }
    });
    if (!response.ok) throw new Error("Failed to get user ID");
    const data = await response.json();
    if (data.data.length === 0) {
        throw new Error(`Nie znaleziono użytkownika o nazwie: ${username}`);
    }
    return data.data[0].id;
}

function connectToWebSocket() {
    const ws = new WebSocket(TWITCH_WEBSOCKET_URL);

    ws.onopen = () => console.log("✅ Połączono z WebSocket.");

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };

    ws.onclose = (event) => {
        console.warn(`🔌 Połączenie WebSocket zostało zamknięte. Kod: ${event.code}, Powód: ${event.reason}. Próba ponownego połączenia za 5 sekund...`);
        setTimeout(connectToWebSocket, 5000);
    };

    ws.onerror = (error) => console.error("❌ Błąd WebSocket:", error);
}

function handleWebSocketMessage(message: any) {
    switch (message.metadata.message_type) {
        case 'session_welcome':
            console.log("🤝 Otrzymano 'session_welcome'. Rozpoczynanie subskrypcji zdarzeń...");
            websocketSessionId = message.payload.session.id;
            createEventSubSubscription();
            break;
        case 'notification':
            handleNotification(message.payload);
            break;
        case "session_keepalive":
            break;
        case 'session_reconnect':
            console.warn("Otrzymano 'session_reconnect'. Trwa ponowne łączenie z nowym adresem...");
            break;
        default:
            console.log("ℹOtrzymano nieobsługiwany typ wiadomości:", message.metadata.message_type, message);
    }
}

async function createEventSubSubscription() {
    try {
        const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'POST',
            headers: {
                'Client-ID': CLIENT_ID!,
                'Authorization': `Bearer ${Deno.env.get("OAUTH_TOKEN")}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'channel.chat.message',
                version: '1',
                condition: { broadcaster_user_id: channelUserId, user_id: botUserId },
                transport: { method: 'websocket', session_id: websocketSessionId }
            })
        });

        if (response.status === 202) {
            console.log(`✅ Pomyślnie zasubskrybowano wiadomości na kanale ${CHANNEL_NAME}. Bot jest gotowy do pracy!`);
        } else {
            const errorData = await response.json();
            console.error("❌ Błąd podczas tworzenia subskrypcji EventSub:", errorData);
        }
    } catch (error) {
        console.error("❌ Błąd podczas tworzenia subskrypcji EventSub:", error);
    }
}

async function sendChatMessage(message: string) {
    const sendMessage = async () => {
        return await fetch('https://api.twitch.tv/helix/chat/messages', {
            method: 'POST',
            headers: {
                'Client-ID': CLIENT_ID!,
                'Authorization': `Bearer ${Deno.env.get("OAUTH_TOKEN")}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                broadcaster_id: channelUserId,
                sender_id: botUserId,
                message: message
            })
        });
    };

    try {
        let response = await sendMessage();
        if (!response.ok) {
            console.error("❌ Błąd podczas wysyłania wiadomości, odświeżanie tokenu...");
            await refreshToken();
            response = await sendMessage();
        }

        if (response.ok) {
            console.log(`🤖 Wysłano odpowiedź: "${message}"`);
        } else {
             const errorData = await response.json();
            console.error("❌ Ponowna próba wysłania wiadomości nie powiodła się:", errorData);
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(`❌ Krytyczny błąd podczas inicjalizacji bota: ${error.message}`);
        } else {

            console.error(`❌ Krytyczny błąd podczas inicjalizacji bota: ${error}`);
        }
    }
}

async function handleNotification(payload: any) {
    if (payload.subscription.type !== 'channel.chat.message') return;

    const event = payload.event;
    const messageText = event.message.text.trim().toLowerCase();
    const chatterLogin = event.chatter_user_login;
    const commandParts = messageText.split(" ");
    const command = commandParts[0];

    console.log(`[${event.broadcaster_user_login}] <${chatterLogin}>: ${event.message.text}`);
    
    const MODS_AND_VIPS = ADMINS!;
    const isModOrVip = MODS_AND_VIPS.includes(chatterLogin) || event.badges.some((badge: any) => badge.set_id === 'moderator');

    switch (command) {
        case '!zajebiste': {
            const receiver = await getMusicRequester();
            if (!receiver) {
                sendChatMessage("Nie udało się pobrać informacji o piosence.");
                return;
            }
            if (chatterLogin === receiver) {
                sendChatMessage(`@${receiver} mocne ego`);
                return;
            }
            const starResp = await giveStar(chatterLogin, receiver, event);
            const totalStars = await getUserStats(receiver)?.stars_received_total ?? 0;
            const responseMessage: string = starResp.message || `@${chatterLogin} dal gwiazdke ✨ dla @${receiver} i ma teraz ${totalStars} gwiazdkuw ✨`;
            sendChatMessage(responseMessage);
            break;
        }
        case '!ilema': {
            const receiver = commandParts[1];
            if (!receiver) {
                sendChatMessage(`@${chatterLogin}, podaj nazwę użytkownika.`);
                return;
            }
            const totalStars = getUserStats(receiver)?.stars_received_total;
            if (totalStars === undefined) {
                sendChatMessage(`@${chatterLogin} o kogo ty mnie kurwa pytasz`);
            } else {
                sendChatMessage(`@${chatterLogin} urzytkownik @${receiver} ma ${totalStars} gwiazdkuw ✨`);
            }
            break;
        }
        case '!topka': {
            try {
                const count = parseInt(commandParts[1], 10) || 3;
                const result = getTopStars(count);
                sendChatMessage(result);
            } catch (error) {
                console.log(error);
                sendChatMessage('coś się rozkurwiło');
            }
            break;
        }
        case '!ilezostalo': {
            try{
                const starsLeft = howMuchLeft(chatterLogin, event);
                sendChatMessage(`@${chatterLogin}pozostalo ci ${starsLeft} gwiazdkuw do rozdania dzisiaj`);
            } catch (error) {
                console.log(error);
                sendChatMessage('coś się rozkurwiło');
            }
            break;
        }
        case '!resetgwiazdkuw':{
            try{
                if(isModOrVip){
                    resetDailyGivenStars()
                    sendChatMessage('zrifreszowane')
                }
                else{
                    sendChatMessage('a ci sie role nie pojebaly?')
                }

            } catch (error) {
                console.log(error);
                sendChatMessage('nie udalo sie zrifreszowac');
            }
            break;
        }
        case '!dumpik':{
            if(isModOrVip){
                const content = getAll();
                const json = content.map(([id, stars_received_total ]) => ({
                id,
                stars_received_total
                }));
                const data = JSON.stringify(json)
                Deno.writeTextFile("./data/users.csv",data);
            }
            break;
        }
        case '!refresh': {
            if (isModOrVip) {
                try {
                    await refreshToken();
                    console.log('Token refreshed');
                    sendChatMessage('Zrifreszowales token spanialy czlowieku');
                } catch (error) {
                    console.log(error);
                }
            }
            break;
        }
    }
}

async function main() {
    try {
        await refreshToken();
    } catch (error) {
        console.error("Błąd odświeżania tokenów przy starcie:", error);
        Deno.exit(1);
    }
    
    console.log("🚀 Startowanie bota...");
    setInterval(refreshToken, 3_600_000);

    if (!BOT_USERNAME || !Deno.env.get("OAUTH_TOKEN") || !CLIENT_ID || !CHANNEL_NAME) {
        console.error('❌ BŁĄD: Proszę uzupełnić dane w pliku .env (BOT_USERNAME, CHANNEL_NAME, OAUTH_TOKEN, CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN).');
        Deno.exit(1);
    }

    try {
        console.log("1. Weryfikacja tokenu OAuth...");
        const validationResponse = await validateToken();
        botUserId = validationResponse.user_id;
        console.log(`✅ Token poprawny. ID bota (${BOT_USERNAME}): ${botUserId}`);

        console.log(`2. Pobieranie ID kanału ${CHANNEL_NAME}...`);
        channelUserId = await getUserId(CHANNEL_NAME);
        console.log(`✅ ID kanału (${CHANNEL_NAME}): ${channelUserId}`);

        console.log("3. Łączenie z serwerem EventSub WebSocket Twitcha...");
        connectToWebSocket();
    } catch (error) {
        if (error instanceof Error) {
            console.error(`❌ Krytyczny błąd podczas inicjalizacji bota: ${error.message}`);
        } else {
            // Handle cases where the error is not an instance of the Error class
            console.error(`❌ Krytyczny błąd podczas inicjalizacji bota: ${error}`);
        }
        Deno.exit(1);
    }
}

initializeDatabase();

 //crons
const scheduleMessages = [
  { minute: 45, text: "@laczeek pozostało 15 minut do hulanki" },
  { minute: 50, text: "@laczeek pozostało 10 minut do hulanki" },
  { minute: 55, text: "@laczeek pozostało 5 minut do hulanki" },
  { minute: 56, text: "@laczeek pozostało 4 minuty do hulanki" },
  { minute: 57, text: "@laczeek pozostało 3 minuty do hulanki" },
  { minute: 58, text: "@laczeek pozostały 2 minuty do hulanki" },
  { minute: 59, text: "@laczeek pozostała 1 minuta do hulanki" },
];

for (const { minute, text } of scheduleMessages) {
  
  Deno.cron(`hulanki ${minute}`,`${minute} 0 * * *`, () => {
    sendChatMessage(text)
  });
}
Deno.cron('reset pulnoc',"22 0 * * *", () => {
  resetDailyGivenStars()
});


main();