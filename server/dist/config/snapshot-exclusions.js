"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SNAPSHOT_EXCLUSION_SET = void 0;
/**
 * Snapshot exclusion list: all contract addresses from ALL_DEPLOYMENTS.MD.
 * Used by merkle-drops and merkle-lp-drops services when taking snapshots —
 * these addresses are always excluded in addition to the DB blocklist.
 * Keep in sync with ALL_DEPLOYMENTS.MD and lib/snapshot-exclusions.ts.
 */
const ALL_DEPLOYMENTS_ADDRESSES = [
    // Deployer 1 (ALL_DEPLOYMENTS.MD)
    '0x1f38de556ad6f039d710211025ee941ce3c546f1',
    '0xec29f41ba9380e34b71d0aeb53bd637ba5258a93',
    '0xfe8d58174d26cc2c60103120cbceb8f75dfdcadac',
    '0x3807f417617e53d4c5c7d7a825a5ce4d105a75d2',
    '0xa6585d334bb737d64ece7abca5acc087dd46e99e',
    '0x611001519cf458d1bf35ebc2b990bd8226df3e08',
    '0xcc54f6d7ff847ab4ab4f10314ebf84486921368b',
    '0x32e97be3a82623faa3d65717455a874c914ba35c',
    '0x6ae7e27cf0ee10516737d7416ef3178cb09d89cf',
    '0xedc0d8ac8f43f079affcdc8d7bf5d58fba69a481',
    '0x45fe6edb92a14a574f22c9a0efe48684faa35e42',
    '0x7df812383b0e8fb6eb05b8ba852c3741d2df3a73',
    '0xed8638fe2b7633b9b95cb48cc40a62f115589eab',
    '0x7cecfc80a57cd8e217e1ace6715c68fa4bad4fad',
    '0xe9b03e16f5c7d38b37b4f79ca250b714afb6755c',
    '0x1b38626a12085547c35bd80455d054950ad72cde',
    '0xa114a8974d4478b09fe9d2e2bf1bdcf28de5bd25',
    '0x1f30aa16b4da0124308e33b8650c351bbca70704',
    '0xed9716ca67a2e478eccefd2c2bfd0c08fdbdca59',
    '0xc87b4f61460b24a0040adaab5452d07f38c876c6',
    '0xfce49ab8b53366c397a0205c4c0cf42ae2b658a8',
    '0xd31130104abb435ce87100e307c8c6ca89268032',
    '0x011ee5f4658c5183fb9f8cd72e264ca5dbd404ab',
    '0x52cbf18a8ae0fd4324b045e13532d35cf05af3e1',
    '0x1051caa460e6dc739583dc2b611c8e3ab37fc543',
    '0x69771ce8c2ec5a78cf87b0a21ad801e74a3eed09',
    '0x59dec9419b32aa9ccc2c46a6fd8aeb68de069c26',
    '0x32435e633eb691f7039eb73107fd15ef13125703',
    '0x9a6a0f1dccf7cc4d98e2d690588e52bb8f0a86ed',
    '0xf3da16ac9d973e5b330f16594855139366c9e06f',
    '0x89ebe687dfe265f584954e8df72934f856ee1b59',
    '0xde2c7a18de8a9d889e18874ea90a42f84fbaa080',
    '0xb0c386da052951a94a8cd8fb5dad3ce5a72a93ed',
    '0x53331b63ef24904ea470cf07b924c7c13a699d8f',
    '0xc56606bf62611749ad6bb2a32e2755994c46d7c7',
    '0x328f7afefb8f561b5a832954257c01b3723054fb',
    '0xfdcf2430e23e56a2c844284a617a95a5b0665153',
    '0x489db27a4c1b822455fafbf59dda495d5e87b28d',
    '0x212cb1ea69f59e1f48e9c344053696c4adebb845',
    '0x9037be0f7d97214f836198eb18d58f5a9b033d31',
    '0x4625ca726d3a22b1aaf712935fdaeb258a0611d9',
    '0x8748eafe150803fd61cb347589ed20340e30c847',
    '0xdaebc91ae2f7df86fbc96806f048adbbbd4b44d0',
    '0x95585d5bff78fbe90840e21c33c2192fe94babd0',
    '0x8b99b6169a9051cd79ad6552a2ec952500e17d6d',
    '0x3dad16d14987d7bf95e160783a6a375f00f8ae27',
    // Deployer 2
    '0xbf48d5376cb30ff760afe3728aff3a308b019c5e',
    '0x25056d6159f6c7a7812d1b65aca2ca14e3e0f4c3',
    '0x636f246b6d484a0448d082f13a71627c2b40b870',
    '0x7553b64c51ebc342de89de834d6e8c0bc3492c96',
    '0x4ad0c435f8556821f21427dc3d17ef22a99f35f7',
    '0x122ee26b2ea3145c86f805f6d1afb4aa15b326c1',
    '0xf976eb6a6cd1139d2550eb20af1542d640bcb06c',
    '0x5992ae42b6b3c55e1e54e4e8cae851f45ff5b1ad',
    '0x9fcd05776c20df2bfd46ed389908e447c66ed6f7',
    '0x99c646326f50d944fc9029467742be4e8f677552',
    '0x6a63cf27ece3ce050932780f6357bfa856060b7e',
    // Deployer 3 (Keno-related)
    '0x540d0f140e7d292681f03aa48cc37db09154a9df',
    '0xbd5862ee636122aff32bee07e6e525bbae01738e',
    '0xbeaf87368efd09bb0e13896444fb4f0e68a67f6a',
    '0xb4707724b86a49333288eca9261ac5557e3875a1',
    '0xad038b0a28f3f5308b891b86085673679a0acd9d',
    // Currently active (Other)
    '0x734a1460b4131f8cfe4950894be89d1a852c957a',
    '0xd66b4489fbff99a8d62f969203899840f2ec69c5',
];
/** Set of addresses always excluded from Merkle (holder) and Merkle LP snapshots. */
exports.SNAPSHOT_EXCLUSION_SET = new Set(ALL_DEPLOYMENTS_ADDRESSES);
//# sourceMappingURL=snapshot-exclusions.js.map