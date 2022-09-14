import Vue from "vue/dist/vue.js";
import {TezosToolkit} from "@taquito/taquito";
import {BeaconWallet} from "@taquito/beacon-wallet";
import {bytes2Char} from "@taquito/utils";

// Tezos tookit instance
const Tezos = new TezosToolkit("https://hangzhounet.api.tez.ie");

// Contract address
const FA2address = "KT1FRiWpd3y7ZNJRnSwj88LMs2j7uLs4fgGZ";

// Contract address
const MintAddress = "KT1L49ByvFkcgdRuj8SA6utgZwr3HfNc3oJV";

// Set up wallet
const walletOptions = {
    name: "Here & Now",
    iconUrl: 'https://hereandnow.events/wp-content/uploads/2022/02/logo.png',
    preferredNetwork: "hangzhounet"
};
const wallet = new BeaconWallet(walletOptions);

var app = new Vue({
    el: "#app",
    data: {
        walletAddress: null,
        FA2contract: null,
        MintContract: null,
        tokenCount : 0,
        EntryTokens: [],
        planetID: null,
        planetMetadata : null,
        loadingTokens: false,
        loadingMetadata: false,
        currentMetadataRequest: 0,
        started: false,
        mintCount: 0,
    },
    mounted() {
        this.loadContracts();
        this.checkConnection();
    },
    methods: {
        syncWallet: async function () {
            wallet
            .requestPermissions({ network: { type: 'hangzhounet' } })
            .then((_) => wallet.getPKH())
            .then((address) => {
                app.walletAddress = address
                console.log(`Wallet connected: ${this.walletAddress}`);
                console.log("Setting provider....");
                Tezos.setProvider({ wallet });
            });
        },
        checkConnection: async function () {
            try {
                // Check if user has already synced wallet
                this.walletAddress = await wallet.getPKH();
                console.log(`Wallet connected: ${this.walletAddress}`);
                console.log("Setting provider....");
                Tezos.setProvider({ wallet });
            } catch {
                console.log("Wallet not connected");
            }
        },
        loadContracts: function () {
            // Load FA2 contract
            Tezos.wallet
                .at(FA2address)
                .then((c) => {
                    this.FA2contract = c;
                    console.log("FA2 contract loaded");
                    // Load mint contract
                    Tezos.wallet
                        .at(MintAddress)
                        .then((c) => {
                            this.MintContract = c;
                            console.log("Mint contract loaded");
                        })
                        .catch((error) => console.log(`Error retreiving mint contract data: ${error}`));
                })
                .catch((error) => console.log(`Error retreiving FA2 contract data: ${error}`));
        },
        checkWallet: async function () {
            // Clean up before checking users tokens
            this.cleanUp();
            this.loadingTokens = true;
            let query = `https://api.hangzhou2net.tzkt.io/v1/contracts/${FA2address}/bigmaps/ledger/keys?active=true&key.address=${this.walletAddress}&value=1`;
            const tokenIDS = await getTokenIDs(query);
            const tokenMetaData = await populateTokenMetadata(tokenIDS);
            const entryTokens = await populateTokens(tokenMetaData);
            this.EntryTokens = entryTokens;
            this.loadingTokens = false;
            console.log("Complete");
        },
        cleanUp: function () {
            this.tokenCount = 0,
            this.EntryTokens = [],
            this.currentTokenID = null,
            this.loadingTokens = false,
            this.currentMetadataRequest = 0,
            this.started = false
        },
        updatePlanetMetadata: function () {
            console.log("Updating metadata");
            this.EntryTokens.forEach(token => {
                if(token.id == this.planetID){
                    console.log("Found metadata");
                    this.planetMetadata = token.metaDataURI;
                }
            });
        },
        openModal: function (highRes) {
            if(highRes == 1){
                this.useHighRes = true;
            } else{
                this.useHighRes = false;
            }
            document.body.style.overflow = "hidden";
            var modal = document.getElementById("passageModal");
            modal.style.display = "flex";
            this.checkWallet();
        },
        closeModal: function () {
            document.getElementById("passageFrame").src = "";
            document.body.style.overflow = "visible";
            var modal = document.getElementById("passageModal");
            modal.style.display = "none";
            this.cleanUp();
        },
        start: function () {
            let source;
            source = `https://han-edition4-build-64815.netlify.app/?walletAddress=${this.walletAddress}&planetID=${this.currentTokenID}&planetMetadata=${this.planetMetadata}`;
            document.getElementById("passageFrame").src = source;
            this.started = true;
        },
        resetWallet: async function () {
            this.walletAddress = null;
            await wallet.clearActiveAccount();
            try {
                const account = await wallet.getPKH();
                console.log("Active account", account);
            } catch {
                console.log("Wallet disconnected");
            }
        },
    },
});

async function getTokenIDs(query) {
    let tokenIDs = [];
    const response = await fetch(query).catch((err) => {
        console.log(err);
    });;
    const data = await response.json();
    for (let i = 0; i < data.length; i++) {
        let id = data[i].key.nat;
        tokenIDs.push(id);
        if(i > 6){
            break;
        }
    }
    console.log("Got token IDs");
    app.tokenCount = tokenIDs.length;
    return tokenIDs;
}

async function populateTokenMetadata(tokenIDs) {
    app.loadingMetadata = true;
    let tokenData = [];
    for (let i = 0; i < tokenIDs.length; i++) {
        app.currentMetadataRequest = i + 1;
        const id = tokenIDs[i];
        let metaDataURI = await getTokenMetadata(id);
        let tknData = new TokenData(id, metaDataURI);
        tokenData.push(tknData);
    }
    console.log("Got token metadata");
    return tokenData;
}

// Gets the token metadatas IPFS uri
async function getTokenMetadata(tokenID) {
    const contract = await Tezos.wallet.at(FA2address);
    let nftStorage = await contract.storage();
    const metadata = await nftStorage.token_metadata.get(tokenID);
    const tokenInfoBytes = metadata.token_info.get("");
    const tokenInfo = bytes2Char(tokenInfoBytes);
    return tokenInfo;
}

// Gets the complete token metadata and adds it to the entry tokens array
async function populateTokens(tokenData) {
    let entryTokens = [];
    for (let i = 0; i < tokenData.length; i++) {
        const element = tokenData[i];
        fetch(convertIPFS(element.metadataURI))
            .then((response) => response.json())
            .then((metadata) => {
                let entryToken = new EntryToken(element.id, element.metadataURI, metadata, convertIPFS(metadata.thumbnailUri));
                entryTokens.push(entryToken);
            })
            .catch((err) => {
                console.log(err);
            });
    }
    console.log("Populated tokens");
    app.loadingMetadata = false;
    return entryTokens;
}

// Converts IPFS uri to http uri
function convertIPFS(uri) {
    return uri.replace("ipfs://", "https://hereandnow.mypinata.cloud/ipfs/");
}

function stripIPFS(uri) {
    return uri.replace("ipfs://", "");
}

class TokenData {
    constructor(id, metadataURI) {
        this.id = id;
        this.metadataURI = metadataURI;
    }
}

class EntryToken {
    constructor(id, metadataURI, metadata, httpThumbnailUri) {
        this.id = id;
        this.metaDataURI = stripIPFS(metadataURI);
        this.metadata = metadata;
        this.httpThumbnailUri = httpThumbnailUri;
    }
}

// Unity -> Iframe -> Parent window pipeline
if (window.addEventListener) {
    window.addEventListener("message", onMessage, false);
} 
else if (window.attachEvent) {
    window.attachEvent("onmessage", onMessage, false);
}

function onMessage(event) {
    // Check sender origin to be trusted
    if (event.origin == "https://han-edition4-build-64815.netlify.app" || event.origin == "https://han-ed4-test-86158.netlify.app" || event.origin == "http://localhost:1234"){
        var data = event.data;
        if(data.hasOwnProperty('purchaseData')){
            purchase(data.purchaseData);
        }
    }else{
        console.log("INVALID ORIGIN");
        return;
    }
}

// Tezos transaction code
function purchase(purchaseData){
    requestTransfer(JSON.parse(purchaseData));
};

function requestTransfer(purchaseData){
    Tezos.wallet
    .transfer({ to: purchaseData.artistaddress , amount: parseFloat(purchaseData.price) })
    .send()
    .then((op) => {
      console.log(`Hash: ${op.opHash}`);
      purchaseData.opHash = op.opHash;
      const frame = document.getElementById("passageFrame");
      frame.contentWindow.postMessage({
          'purchaseData': purchaseData
      }, "*");
      op.confirmation()
        .then((result) => {
          console.log(result);
          if (result.completed) {
            console.log('Transaction correctly processed!');
          } else {
            console.log('An error has occurred');
          }
        })
        .catch((err) => console.log(err));
    });
}