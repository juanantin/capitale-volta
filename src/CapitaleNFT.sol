// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ICapitalePricing} from "./interfaces/ICapitalePricing.sol";
import {ICapitaleVault} from "./interfaces/ICapitaleVault.sol";

/// @title CapitaleNFT ("CAPITALE" / PALAZZO)
/// @notice One NFT per building. 3,000 residential buildings plus the Mayor's building #0.
///         Build by burning $CAPITALE: choose a district (0-3) and a style (0-2), both permanent.
///         Numbers are sequential city-wide; within a district, plots are handed out from the
///         centre outwards (plot 0 is nearest the Mayor). Buildings are freely transferable and
///         their unclaimed rewards and height travel with them (kept by the vault per building).
///         Inviter numbers are cosmetic only (flag / neon sign / fireworks); no profit share.
/// @dev    Not upgradeable, no owner powers, no royalties.
contract CapitaleNFT is ERC721Enumerable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MAX_BUILDINGS = 3000;
    /// Number of districts (cities), fixed at deploy. Capitale: 0 Milano, 1 Roma, 2 Napoli, 3 Venezia, 4 Palermo.
    /// Every city earns the same reward tokens; the city sets the plot and the street race.
    uint8 public immutable districts;
    uint8 public constant STYLES = 3;
    uint256 public constant MAYOR_ID = 0;

    IERC20 public immutable capitale;
    ICapitalePricing public immutable pricing;
    address private immutable deployer;
    ICapitaleVault public vault;

    struct Building {
        uint8 district;
        uint8 style;
        bool earlyBird;
        uint16 plot; // order within its district, 0 = nearest the centre
        uint32 invites;
        uint32 inviter; // 0 = none
        uint64 builtAt;
    }

    mapping(uint256 => Building) internal _buildings;
    /// Residential buildings minted (excludes the Mayor). The next id is totalResidents + 1.
    uint256 public totalResidents;
    uint256[5] public districtCount;
    uint256 public totalBurned;

    event VaultSet(address vault);
    event Built(
        uint256 indexed id,
        address indexed owner,
        uint8 district,
        uint8 style,
        uint16 plot,
        uint256 tokensBurned,
        uint256 usd
    );
    event Invited(uint256 indexed inviterId, uint256 indexed newId, uint32 totalInvites);

    error CityLocked();
    error BadDistrict();
    error BadStyle();
    error PriceAboveMax(uint256 price, uint256 maxPrice);
    error VaultNotSet();
    error NotDeployer();
    error VaultAlreadySet();
    error BadConfig();

    constructor(IERC20 capitale_, ICapitalePricing pricing_, address mayorOwner, uint8 districts_)
        ERC721("CAPITALE", "PALAZZO")
    {
        if (address(capitale_) == address(0) || address(pricing_) == address(0) || mayorOwner == address(0)) {
            revert BadConfig();
        }
        if (districts_ == 0 || districts_ > 5) revert BadConfig();
        districts = districts_;
        capitale = capitale_;
        pricing = pricing_;
        deployer = msg.sender;
        _buildings[MAYOR_ID].builtAt = uint64(block.timestamp);
        _mint(mayorOwner, MAYOR_ID);
    }

    /// @notice One-time link to the vault (the vault needs this contract's address and vice versa).
    function setVault(ICapitaleVault vault_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (address(vault) != address(0)) revert VaultAlreadySet();
        if (address(vault_) == address(0)) revert BadConfig();
        vault = vault_;
        emit VaultSet(address(vault_));
    }

    // ─────────────────────────── Build ───────────────────────────

    /// @param district  0 Milano, 1 Roma, 2 Napoli, 3 Venezia, 4 Palermo
    /// @param style     0, 1 or 2
    /// @param inviter   inviting building number, 0 for none (cosmetic only)
    /// @param maxPrice  most $CAPITALE the builder accepts to burn
    function mint(uint8 district, uint8 style, uint256 inviter, uint256 maxPrice)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (address(vault) == address(0)) revert VaultNotSet();
        if (totalResidents >= MAX_BUILDINGS) revert CityLocked();
        if (district >= districts) revert BadDistrict();
        if (style >= STYLES) revert BadStyle();

        id = totalResidents + 1;
        bool earlyBird = pricing.isEarlyBird();
        (uint256 tokens, uint256 usd) = pricing.quoteAndUpdate(id);
        if (tokens > maxPrice) revert PriceAboveMax(tokens, maxPrice);

        totalResidents = id;
        uint16 plot = uint16(districtCount[district]++);
        totalBurned += tokens;

        Building storage b = _buildings[id];
        b.district = district;
        b.style = style;
        b.earlyBird = earlyBird;
        b.plot = plot;
        b.builtAt = uint64(block.timestamp);

        if (inviter != 0 && inviter < id && _ownerOf(inviter) != msg.sender) {
            b.inviter = uint32(inviter);
            uint32 n = ++_buildings[inviter].invites;
            emit Invited(inviter, id, n);
        }

        // Settles the week first, then registers the building for rewards and the street race.
        vault.onMint(id, district, earlyBird);

        capitale.safeTransferFrom(msg.sender, DEAD, tokens);
        _safeMint(msg.sender, id);
        emit Built(id, msg.sender, district, style, plot, tokens, usd);
    }

    // ─────────────────────────── Views ───────────────────────────

    function buildingOf(uint256 id) external view returns (Building memory) {
        _requireOwned(id);
        return _buildings[id];
    }

    function districtOf(uint256 id) external view returns (uint8) {
        _requireOwned(id);
        return _buildings[id].district;
    }

    function exists(uint256 id) external view returns (bool) {
        return _ownerOf(id) != address(0);
    }

    function isLocked() external view returns (bool) {
        return totalResidents >= MAX_BUILDINGS;
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        Building memory b = _buildings[id];
        bool mayor = id == MAYOR_ID;
        uint256 level = mayor || address(vault) == address(0) ? 1 : vault.levelOf(id);
        string memory city = mayor ? "Centro" : _cityName(b.district);

        string memory attrs = string.concat(
            '[{"trait_type":"City","value":"',
            city,
            '"},{"trait_type":"Style","value":"',
            mayor ? "Mayor" : uint256(b.style).toString(),
            '"},{"trait_type":"Level","display_type":"number","value":',
            level.toString(),
            '},{"trait_type":"Invites","display_type":"number","value":',
            uint256(b.invites).toString(),
            '},{"trait_type":"Plot","display_type":"number","value":',
            uint256(b.plot).toString(),
            '},{"trait_type":"Early bird","value":"',
            b.earlyBird ? "yes" : "no",
            '"}]'
        );
        string memory json = string.concat(
            '{"name":"CAPITALE #',
            id.toString(),
            '","description":"A palazzo in CAPITALE, a city of Italy on Elysium, launched on Montra.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(id, b, level, mayor))),
            '","attributes":',
            attrs,
            "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // ─────────────────────────── Internals ───────────────────────────

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev The NFT image, in the site's Montra look: black, a thin gold frame, the building's
    ///      floors outlined in its city's colour (one per level, up to 12 drawn), the city name
    ///      and the number in gold.
    function _svg(uint256 id, Building memory b, uint256 level, bool mayor) internal pure returns (string memory) {
        string memory colour = mayor ? "#e9b64a" : _colour(b.district);
        uint256 floors = level > 12 ? 12 : level;
        string memory stack;
        for (uint256 i; i < floors; ++i) {
            stack = string.concat(
                stack,
                '<rect x="132" y="',
                (250 - i * 16).toString(),
                '" width="96" height="13" rx="1" fill="#161616" stroke="',
                colour,
                '" stroke-width="1.6"/>'
            );
        }
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360"><rect width="360" height="360" fill="#050505"/>',
            '<rect x="12" y="12" width="336" height="336" fill="none" stroke="#e9b64a" stroke-opacity="0.6"/>',
            '<ellipse cx="180" cy="270" rx="128" ry="30" fill="#121212" stroke="#e9b64a" stroke-opacity="0.45"/>',
            stack,
            '<text x="180" y="52" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#f2f2f2">',
            mayor ? "IL SINDACO" : _cityName(b.district),
            '</text><text x="180" y="80" text-anchor="middle" font-family="monospace" font-size="15" letter-spacing="3" fill="#e9b64a">',
            "CAPITALE #",
            id.toString(),
            "</text></svg>"
        );
    }

    function _cityName(uint8 d) internal pure returns (string memory) {
        if (d == 0) return "Milano";
        if (d == 1) return "Roma";
        if (d == 2) return "Napoli";
        if (d == 3) return "Venezia";
        return "Palermo";
    }

    function _colour(uint8 d) internal pure returns (string memory) {
        // The same city inks as the site.
        if (d == 0) return "#d9b45a"; // Milano gold
        if (d == 1) return "#e0874f"; // Roma orange
        if (d == 2) return "#e0648f"; // Napoli rose
        if (d == 3) return "#5b8def"; // Venezia blue
        return "#5fc48a"; // Palermo green
    }
}
