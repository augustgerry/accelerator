"""
High-Fidelity Enterprise Hardware Rear Chassis I/O & Port Callout Generator.
Generates authentic manufacturer-grade rear views with dual PSUs, network ports,
management interfaces, and color-coded callout lines for Fortinet, Cisco, Sangfor,
Dell, HPE, and multi-node appliances.
"""

import io
import base64
from PIL import Image, ImageDraw, ImageFont


def _get_font(size: int, bold: bool = False):
    try:
        font_path = "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"
        return ImageFont.truetype(font_path, size)
    except Exception:
        try:
            font_path = "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"
            return ImageFont.truetype(font_path, size)
        except Exception:
            return ImageFont.load_default()


def render_rear_chassis_visual(
    device_name: str = "Enterprise 2U Multi-Node Platform",
    node_prefix: str = "Node",
    mgmt_speed: str = "1G",
    data_speed: str = "25G",
) -> dict:
    """Generate authentic rear chassis I/O diagram with callout lines dynamically tailored to the brand and device model."""
    name_lower = (device_name or "").lower()

    # Brand & Category detection
    is_fortinet = any(k in name_lower for k in ("fortinet", "fortigate", "fg-", "firewall", "palo", "checkpoint", "ngaf"))
    is_cisco = any(k in name_lower for k in ("cisco", "catalyst", "c9300", "c9200", "switch", "nexus", "tor", "leaf")) and not is_fortinet
    is_sangfor = any(k in name_lower for k in ("sangfor", "aserver", "hci"))
    is_dell = any(k in name_lower for k in ("dell", "poweredge", "r750", "r740", "r650", "powerstore"))
    is_hpe = any(k in name_lower for k in ("hpe", "proliant", "dl360", "dl380", "gen10", "gen11"))
    is_storage = any(k in name_lower for k in ("pure", "flasharray", "san", "storage", "netapp"))

    width, height = 1040, 360
    img = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    font_brand = _get_font(10, bold=True)
    font_callout_title = _get_font(13, bold=True)
    font_callout_speed = _get_font(12, bold=True)
    font_port = _get_font(8, bold=True)
    font_screw = _get_font(9, bold=True)

    # 1U or 2U dimensions
    is_1u = is_fortinet or is_cisco or ("1u" in name_lower or "dl360" in name_lower)
    if is_1u:
        c_left, c_right = 50, 990
        c_top, c_bottom = 190, 315  # Slim 1U chassis
    else:
        c_left, c_right = 40, 1000
        c_top, c_bottom = 165, 335  # 2U chassis

    # Outer Rack Ears
    ear_w = 26
    for ear_x in [c_left - ear_w, c_right]:
        draw.rounded_rectangle([ear_x, c_top - 5, ear_x + ear_w, c_bottom + 5], radius=3, fill=(180, 185, 190), outline=(130, 135, 140), width=1)
        draw.ellipse([ear_x + 7, c_top + 10, ear_x + 19, c_top + 22], fill=(255, 255, 255), outline=(130, 135, 140), width=1)
        draw.ellipse([ear_x + 7, c_bottom - 22, ear_x + 19, c_bottom - 10], fill=(255, 255, 255), outline=(130, 135, 140), width=1)

    # Main Chassis Metal Frame
    draw.rectangle([c_left, c_top, c_right, c_bottom], fill=(228, 230, 233), outline=(100, 105, 110), width=2)

    if is_fortinet:
        # ════════ FORTINET FORTIGATE 100F OFFICIAL STENCIL REAR ════════
        # Brand Header Bar on ear
        draw.rectangle([c_left + 6, c_top - 18, c_left + 160, c_top - 2], fill=(204, 0, 0))
        draw.text((c_left + 12, c_top - 17), "FORTINET FORTIGATE 100F", fill=(255, 255, 255), font=font_brand)

        # Dual Redundant AC Power Supplies on the left
        psu1 = [c_left + 15, c_top + 8, c_left + 145, c_bottom - 8]
        psu2 = [c_left + 155, c_top + 8, c_left + 285, c_bottom - 8]
        for psu_box, psu_lbl in [(psu1, "PSU-1 (AC 100-240V)"), (psu2, "PSU-2 (AC 100-240V)")]:
            draw.rectangle(psu_box, fill=(30, 33, 38), outline=(120, 125, 130), width=1)
            cx, cy = (psu_box[0] + psu_box[2]) // 2, (psu_box[1] + psu_box[3]) // 2
            draw.polygon([(cx - 12, cy - 14), (cx + 12, cy - 14), (cx + 15, cy), (cx + 10, cy + 12), (cx - 10, cy + 12), (cx - 15, cy)], fill=(12, 14, 16), outline=(70, 75, 80))
            draw.ellipse([psu_box[0] + 8, psu_box[3] - 16, psu_box[0] + 16, psu_box[3] - 8], fill=(34, 197, 94))
            draw.rectangle([psu_box[2] - 12, psu_box[3] - 20, psu_box[2] - 4, psu_box[3] - 4], fill=(220, 38, 38))
            draw.text((psu_box[0] + 8, psu_box[1] + 6), psu_lbl, fill=(200, 205, 210), font=_get_font(7, bold=True))

        # Cooling Fans
        fan_left = c_left + 305
        fan_right = c_left + 465
        draw.rectangle([fan_left, c_top + 8, fan_right, c_bottom - 8], fill=(45, 50, 56), outline=(130, 135, 140))
        for fx in range(fan_left + 10, fan_right - 10, 26):
            draw.ellipse([fx, c_top + 16, fx + 22, c_bottom - 16], fill=(20, 24, 28), outline=(80, 85, 90))
            draw.ellipse([fx + 8, c_top + 24, fx + 14, c_bottom - 24], fill=(120, 125, 130))

        # Ground terminal
        g_x = fan_right + 20
        draw.ellipse([g_x, (c_top + c_bottom) // 2 - 6, g_x + 12, (c_top + c_bottom) // 2 + 6], fill=(217, 119, 6), outline=(146, 64, 14))

        # HA Ports (Active-Passive Sync)
        ha1_x = g_x + 35
        draw.rectangle([ha1_x, c_top + 20, ha1_x + 38, c_bottom - 20], fill=(20, 22, 25), outline=(90, 95, 100))
        draw.rectangle([ha1_x + 3, c_top + 24, ha1_x + 35, c_bottom - 24], fill=(2, 132, 199), outline=(56, 189, 248))
        draw.text((ha1_x + 6, c_top + 34), "HA-1", fill=(255, 255, 255), font=font_port)

        ha2_x = ha1_x + 46
        draw.rectangle([ha2_x, c_top + 20, ha2_x + 38, c_bottom - 20], fill=(20, 22, 25), outline=(90, 95, 100))
        draw.rectangle([ha2_x + 3, c_top + 24, ha2_x + 35, c_bottom - 24], fill=(2, 132, 199), outline=(56, 189, 248))
        draw.text((ha2_x + 6, c_top + 34), "HA-2", fill=(255, 255, 255), font=font_port)

        # Dedicated MGMT Port
        mgmt_x = ha2_x + 46
        draw.rectangle([mgmt_x, c_top + 20, mgmt_x + 38, c_bottom - 20], fill=(20, 22, 25), outline=(90, 95, 100))
        draw.rectangle([mgmt_x + 3, c_top + 24, mgmt_x + 35, c_bottom - 24], fill=(2, 132, 199), outline=(56, 189, 248))
        draw.text((mgmt_x + 5, c_top + 34), "MGMT", fill=(255, 255, 255), font=font_port)

        # 4x 10G SFP+ FortiLink Cages
        sfp1_x = mgmt_x + 65
        for s in range(4):
            sx = sfp1_x + s * 42
            draw.rectangle([sx, c_top + 18, sx + 36, c_bottom - 18], fill=(30, 35, 42), outline=(130, 140, 150))
            draw.rectangle([sx + 3, c_top + 22, sx + 33, c_bottom - 22], fill=(74, 222, 128), outline=(34, 197, 94))
            draw.text((sx + 5, c_top + 34), f"X{s+1}", fill=(10, 40, 15), font=font_port)

        # Fortinet Callout Lines
        draw.line([(c_left + 150, c_top + 8), (c_left + 150, 75), (c_left + 50, 75)], fill=(220, 38, 38), width=3)
        draw.text((c_left + 55, 55), "Dual Redundant AC Power (1+1)", fill=(0, 0, 0), font=font_callout_title)
        draw.text((c_left + 55, 85), "100-240V Hot-Swap", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(ha1_x + 19, c_top + 20), (ha1_x + 19, 110), (ha1_x - 60, 110)], fill=(2, 132, 199), width=3)
        draw.text((ha1_x - 175, 95), "HA-1 / HA-2 Heartbeat", fill=(0, 0, 0), font=font_callout_title)
        draw.text((ha1_x - 120, 120), "Active-Passive Sync", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(mgmt_x + 19, c_top + 20), (mgmt_x + 19, 50), (mgmt_x + 70, 50)], fill=(2, 132, 199), width=3)
        draw.text((mgmt_x + 75, 40), "Dedicated MGMT Port", fill=(0, 0, 0), font=font_callout_title)
        draw.text((mgmt_x + 75, 65), "1GE RJ45 Dedicated", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(sfp1_x + 60, c_top + 18), (sfp1_x + 60, 100), (sfp1_x + 130, 100)], fill=(132, 204, 22), width=3)
        draw.text((sfp1_x + 135, 90), "4x 10GE SFP+ FortiLink / Uplink", fill=(0, 0, 0), font=font_callout_title)
        draw.text((sfp1_x + 135, 115), "10G Data Throughput", fill=(100, 100, 100), font=font_callout_speed)

    elif is_sangfor:
        # ════════ SANGFOR HCI aServer 2U OFFICIAL STENCIL REAR ════════
        # Brand Header Bar
        draw.rectangle([c_left + 6, c_top - 18, c_left + 190, c_top - 2], fill=(14, 116, 144))
        draw.text((c_left + 12, c_top - 17), "SANGFOR HCI aServer 2U PLATFORM", fill=(255, 255, 255), font=font_brand)

        # Dual 2000W Redundant Platinum PSUs on the far right
        psu1_x = c_right - 180
        psu2_x = c_right - 95
        for px, plabel in [(psu1_x, "PSU1: 2000W"), (psu2_x, "PSU2: 2000W")]:
            draw.rectangle([px, c_top + 10, px + 80, c_bottom - 10], fill=(28, 32, 38), outline=(130, 135, 140))
            draw.polygon([(px + 20, c_top + 30), (px + 60, c_top + 30), (px + 65, c_top + 65), (px + 15, c_top + 65)], fill=(15, 18, 22), outline=(80, 85, 90))
            draw.ellipse([px + 10, c_bottom - 30, px + 22, c_bottom - 18], fill=(34, 197, 94))
            draw.rectangle([px + 50, c_bottom - 32, px + 72, c_bottom - 16], fill=(234, 88, 12))
            draw.text((px + 8, c_bottom - 50), plabel, fill=(200, 205, 210), font=_get_font(7, bold=True))

        # 2x PCIe Expansion Slots (Full Height / Half Length)
        draw.rectangle([c_left + 15, c_top + 10, c_left + 320, c_bottom - 10], fill=(210, 214, 220), outline=(140, 145, 150))
        draw.line([(c_left + 165, c_top + 10), (c_left + 165, c_bottom - 10)], fill=(120, 125, 130), width=2)
        draw.text((c_left + 35, c_top + 20), "PCIe Riser 1 (Gen4 x16)", fill=(80, 85, 90), font=_get_font(8, bold=True))
        draw.text((c_left + 185, c_top + 20), "PCIe Riser 2 (Gen4 x16)", fill=(80, 85, 90), font=_get_font(8, bold=True))

        # Main Motherboard I/O Section (Center)
        mb_x = c_left + 340
        draw.rectangle([mb_x, c_top + 20, mb_x + 420, c_bottom - 15], fill=(35, 40, 48), outline=(100, 105, 110))

        # 4x GbE Base-T RJ45 (ETH 1 to 4)
        for e in range(4):
            ex = mb_x + 15 + e * 42
            draw.rectangle([ex, c_bottom - 55, ex + 34, c_bottom - 22], fill=(20, 22, 25), outline=(120, 125, 130))
            draw.rectangle([ex + 2, c_bottom - 52, ex + 32, c_bottom - 25], fill=(2, 132, 199), outline=(56, 189, 248))
            draw.text((ex + 4, c_bottom - 46), f"ETH{e+1}", fill=(255, 255, 255), font=font_port)

        # 2x 10GbE SFP+ Optical Fabric Ports
        sfp_start = mb_x + 195
        for s in range(2):
            sx = sfp_start + s * 46
            draw.rectangle([sx, c_bottom - 55, sx + 38, c_bottom - 22], fill=(25, 30, 38), outline=(130, 135, 140))
            draw.rectangle([sx + 3, c_bottom - 51, sx + 35, c_bottom - 26], fill=(74, 222, 128), outline=(34, 197, 94))
            draw.text((sx + 5, c_bottom - 46), f"SFP{s+1}", fill=(10, 40, 15), font=font_port)

        # Dedicated IPMI 2.0 Port + VGA + USB
        ipmi_x = sfp_start + 110
        draw.rectangle([ipmi_x, c_bottom - 55, ipmi_x + 36, c_bottom - 22], fill=(20, 83, 45), outline=(34, 197, 94))
        draw.rectangle([ipmi_x + 3, c_bottom - 51, ipmi_x + 33, c_bottom - 26], fill=(2, 132, 199))
        draw.text((ipmi_x + 5, c_bottom - 46), "IPMI", fill=(255, 255, 255), font=font_port)

        vga_x = ipmi_x + 46
        draw.rectangle([vga_x, c_bottom - 52, vga_x + 28, c_bottom - 26], fill=(37, 99, 235))
        draw.text((vga_x + 4, c_bottom - 46), "VGA", fill=(255, 255, 255), font=font_port)

        # Sangfor Callouts
        draw.line([(psu1_x + 40, c_top + 10), (psu1_x + 40, 60), (psu1_x + 100, 60)], fill=(220, 38, 38), width=3)
        draw.text((psu1_x - 160, 45), "Dual 2000W Redundant Platinum PSUs", fill=(0, 0, 0), font=font_callout_title)
        draw.text((psu1_x - 160, 70), "Hot-Swappable 80 PLUS Platinum", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(mb_x + 80, c_bottom - 55), (mb_x + 80, 110), (mb_x - 60, 110)], fill=(2, 132, 199), width=3)
        draw.text((mb_x - 240, 95), "4x 1GbE Base-T RJ45 Ports", fill=(0, 0, 0), font=font_callout_title)
        draw.text((mb_x - 240, 120), "Management & VM Network", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(sfp_start + 23, c_bottom - 55), (sfp_start + 23, 40), (sfp_start - 60, 40)], fill=(132, 204, 22), width=3)
        draw.text((sfp_start - 240, 25), "2x 10GbE SFP+ Storage Fabric", fill=(0, 0, 0), font=font_callout_title)
        draw.text((sfp_start - 240, 50), "aSAN Virtual SAN Traffic", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(ipmi_x + 18, c_bottom - 55), (ipmi_x + 18, 90), (ipmi_x + 70, 90)], fill=(34, 197, 94), width=3)
        draw.text((ipmi_x + 75, 75), "Dedicated IPMI 2.0 Port", fill=(0, 0, 0), font=font_callout_title)
        draw.text((ipmi_x + 75, 100), "Remote Hardware Monitoring", fill=(100, 100, 100), font=font_callout_speed)

    elif is_cisco:
        # ════════ CISCO CATALYST 9300 ENTERPRISE SWITCH REAR ════════
        draw.rectangle([c_left + 6, c_top - 18, c_left + 180, c_top - 2], fill=(3, 105, 161))
        draw.text((c_left + 12, c_top - 17), "CISCO CATALYST 9300 SWITCH", fill=(255, 255, 255), font=font_brand)

        # Dual Hot-Swap Power Supplies on left
        psu1 = [c_left + 15, c_top + 8, c_left + 150, c_bottom - 8]
        psu2 = [c_left + 160, c_top + 8, c_left + 295, c_bottom - 8]
        for psu_box, psu_lbl in [(psu1, "PWR-1 (715W Platinum)"), (psu2, "PWR-2 (715W Platinum)")]:
            draw.rectangle(psu_box, fill=(35, 38, 42), outline=(130, 135, 140))
            cx, cy = (psu_box[0] + psu_box[2]) // 2, (psu_box[1] + psu_box[3]) // 2
            draw.polygon([(cx - 12, cy - 14), (cx + 12, cy - 14), (cx + 15, cy), (cx + 10, cy + 12), (cx - 10, cy + 12), (cx - 15, cy)], fill=(15, 16, 18), outline=(60, 64, 70))
            draw.ellipse([psu_box[0] + 6, psu_box[3] - 16, psu_box[0] + 14, psu_box[3] - 8], fill=(34, 197, 94))
            draw.rectangle([psu_box[2] - 12, psu_box[3] - 20, psu_box[2] - 4, psu_box[3] - 4], fill=(234, 88, 12))
            draw.text((psu_box[0] + 8, psu_box[1] + 6), psu_lbl, fill=(200, 205, 210), font=_get_font(7, bold=True))

        # 3x Fan Modules
        fan_start = c_left + 315
        for fi in range(3):
            fx = fan_start + fi * 90
            draw.rectangle([fx, c_top + 8, fx + 82, c_bottom - 8], fill=(50, 55, 60), outline=(140, 145, 150))
            draw.ellipse([fx + 18, (c_top + c_bottom) // 2 - 24, fx + 64, (c_top + c_bottom) // 2 + 24], fill=(20, 22, 26), outline=(90, 95, 100))
            draw.text((fx + 16, c_top + 10), f"FAN-{fi+1}", fill=(180, 185, 190), font=_get_font(7, bold=True))

        # StackWise-480 / StackPower Ports on right
        stk_x = fan_start + 295
        draw.rectangle([stk_x, c_top + 15, stk_x + 95, c_bottom - 15], fill=(25, 28, 32), outline=(100, 105, 110))
        draw.rectangle([stk_x + 8, c_top + 22, stk_x + 42, c_bottom - 22], fill=(2, 132, 199), outline=(56, 189, 248))
        draw.text((stk_x + 10, c_top + 34), "STACK1", fill=(255, 255, 255), font=font_port)
        draw.rectangle([stk_x + 50, c_top + 22, stk_x + 84, c_bottom - 22], fill=(2, 132, 199), outline=(56, 189, 248))
        draw.text((stk_x + 52, c_top + 34), "STACK2", fill=(255, 255, 255), font=font_port)

        mgmt_x = stk_x + 115
        draw.rectangle([mgmt_x, c_top + 18, mgmt_x + 42, c_bottom - 18], fill=(25, 28, 32), outline=(100, 105, 110))
        draw.rectangle([mgmt_x + 3, c_top + 22, mgmt_x + 39, c_bottom - 22], fill=(74, 222, 128), outline=(34, 197, 94))
        draw.text((mgmt_x + 7, c_top + 34), "MGMT", fill=(10, 40, 15), font=font_port)

        # Cisco Callouts
        draw.line([(c_left + 155, c_top + 8), (c_left + 155, 75), (c_left + 60, 75)], fill=(220, 38, 38), width=3)
        draw.text((c_left + 65, 55), "Dual Redundant AC Power Supplies", fill=(0, 0, 0), font=font_callout_title)
        draw.text((c_left + 65, 85), "Hot-Swappable 715W Platinum", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(stk_x + 46, c_top + 15), (stk_x + 46, 70), (stk_x - 60, 70)], fill=(2, 132, 199), width=3)
        draw.text((stk_x - 220, 55), "StackWise-480 Stacking Fabric", fill=(0, 0, 0), font=font_callout_title)
        draw.text((stk_x - 170, 85), "480 Gbps Hardware Stacking", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(mgmt_x + 21, c_top + 18), (mgmt_x + 21, 50), (mgmt_x + 75, 50)], fill=(132, 204, 22), width=3)
        draw.text((mgmt_x + 80, 40), "Dedicated Out-of-Band MGMT", fill=(0, 0, 0), font=font_callout_title)
        draw.text((mgmt_x + 80, 65), "1G RJ45 Console / Management", fill=(100, 100, 100), font=font_callout_speed)

    elif is_dell or is_hpe:
        # ════════ DELL POWEREDGE / HPE PROLIANT ENTERPRISE SERVER REAR ════════
        brand_name = "DELL POWEREDGE R750 2U" if is_dell else "HPE PROLIANT DL360 GEN10"
        brand_color = (29, 78, 216) if is_dell else (5, 150, 105)
        draw.rectangle([c_left + 6, c_top - 18, c_left + 190, c_top - 2], fill=brand_color)
        draw.text((c_left + 12, c_top - 17), brand_name, fill=(255, 255, 255), font=font_brand)

        # Dual Titanium Hot-Plug PSUs on the left
        psu1_x = c_left + 15
        psu2_x = c_left + 105
        for px, plbl in [(psu1_x, "PSU 1: 1400W"), (psu2_x, "PSU 2: 1400W")]:
            draw.rectangle([px, c_top + 10, px + 80, c_bottom - 10], fill=(28, 32, 38), outline=(130, 135, 140))
            draw.polygon([(px + 15, c_top + 25), (px + 65, c_top + 25), (px + 70, c_top + 60), (px + 10, c_top + 60)], fill=(15, 18, 22), outline=(80, 85, 90))
            draw.ellipse([px + 10, c_bottom - 26, px + 22, c_bottom - 14], fill=(34, 197, 94))
            draw.rectangle([px + 52, c_bottom - 28, px + 72, c_bottom - 12], fill=(220, 38, 38))
            draw.text((px + 6, c_bottom - 44), plbl, fill=(200, 205, 210), font=_get_font(7, bold=True))

        # PCIe Riser Bays (Center)
        r_x = c_left + 210
        draw.rectangle([r_x, c_top + 10, r_x + 360, c_bottom - 10], fill=(215, 218, 224), outline=(140, 145, 150))
        draw.line([(r_x + 180, c_top + 10), (r_x + 180, c_bottom - 10)], fill=(120, 125, 130), width=2)
        draw.text((r_x + 20, c_top + 25), "PCIe Slot 1 (Gen4 FHFL)", fill=(80, 85, 90), font=_get_font(8, bold=True))
        draw.text((r_x + 200, c_top + 25), "PCIe Slot 2 (Gen4 FHFL)", fill=(80, 85, 90), font=_get_font(8, bold=True))

        # OCP 3.0 / FlexibleLOM Mezzanine Network Card (Bottom Center)
        ocp_x = r_x + 40
        draw.rectangle([ocp_x, c_bottom - 60, ocp_x + 180, c_bottom - 15], fill=(30, 35, 42), outline=(90, 95, 100))
        for p in range(4):
            px = ocp_x + 8 + p * 42
            draw.rectangle([px, c_bottom - 54, px + 36, c_bottom - 20], fill=(74, 222, 128), outline=(34, 197, 94))
            draw.text((px + 4, c_bottom - 45), f"25G-{p+1}", fill=(10, 40, 15), font=font_port)

        # Dedicated Remote Management (iDRAC9 / iLO 5)
        idrac_x = c_right - 140
        draw.rectangle([idrac_x, c_top + 20, idrac_x + 45, c_bottom - 20], fill=(20, 25, 30), outline=(100, 105, 110))
        draw.rectangle([idrac_x + 5, c_top + 26, idrac_x + 40, c_bottom - 26], fill=(2, 132, 199), outline=(56, 189, 248))
        draw.text((idrac_x + 8, c_top + 38), "iDRAC\n / iLO", fill=(255, 255, 255), font=font_port)

        # Callouts
        draw.line([(psu1_x + 40, c_top + 10), (psu1_x + 40, 65), (psu1_x - 30, 65)], fill=(220, 38, 38), width=3)
        draw.text((c_left + 10, 50), "Dual 1400W Titanium PSUs", fill=(0, 0, 0), font=font_callout_title)
        draw.text((c_left + 10, 75), "Hot-Plug Redundant", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(ocp_x + 90, c_bottom - 60), (ocp_x + 90, 95), (ocp_x - 40, 95)], fill=(132, 204, 22), width=3)
        draw.text((ocp_x - 260, 80), "OCP 3.0: 4x 25GbE SFP28", fill=(0, 0, 0), font=font_callout_title)
        draw.text((ocp_x - 260, 105), "High-Speed Data & vSAN Fabric", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(idrac_x + 22, c_top + 20), (idrac_x + 22, 60), (idrac_x + 80, 60)], fill=(2, 132, 199), width=3)
        draw.text((idrac_x + 85, 45), "Dedicated Out-of-Band MGMT", fill=(0, 0, 0), font=font_callout_title)
        draw.text((idrac_x + 85, 70), "iDRAC9 Enterprise / iLO 5", fill=(100, 100, 100), font=font_callout_speed)

    else:
        # ════════ 2U MULTI-NODE PLATFORM REAR (Rubrik / Nutanix Style) ════════
        c_mid_y = (c_top + c_bottom) // 2
        psu_left, psu_right = 475, 565
        psu_top_box = [psu_left, c_top + 4, psu_right, c_mid_y - 3]
        psu_bot_box = [psu_left, c_mid_y + 3, psu_right, c_bottom - 4]

        for pb in [psu_top_box, psu_bot_box]:
            draw.rectangle(pb, fill=(35, 38, 42), outline=(140, 145, 150), width=1)
            sx, sy = (pb[0] + pb[2]) // 2, (pb[1] + pb[3]) // 2
            draw.polygon([(sx - 14, sy - 18), (sx + 14, sy - 18), (sx + 18, sy), (sx + 12, sy + 16), (sx - 12, sy + 16), (sx - 18, sy)], fill=(15, 16, 18), outline=(60, 64, 70), width=2)
            draw.rectangle([pb[2] - 14, pb[3] - 22, pb[2] - 4, pb[3] - 4], fill=(220, 38, 38), outline=(150, 20, 20))
            draw.ellipse([pb[0] + 6, pb[3] - 16, pb[0] + 14, pb[3] - 8], fill=(34, 197, 94))

        def draw_node_bay(x1, y1, x2, y2, bay_id):
            draw.rectangle([x1, y1, x2, y2], fill=(236, 238, 241), outline=(160, 165, 170), width=1)
            port_y = y1 + 38
            mgt_w, mgt_h = 28, 20
            draw.rectangle([x1 + 12, port_y, x1 + 12 + mgt_w * 2 + 6, port_y + mgt_h + 4], fill=(20, 22, 25), outline=(80, 85, 90), width=1)
            draw.rectangle([x1 + 15, port_y + 2, x1 + 15 + mgt_w, port_y + 2 + mgt_h], fill=(2, 132, 199), outline=(14, 165, 233))
            draw.text((x1 + 19, port_y + 7), "Mgt1", fill=(255, 255, 255), font=font_port)

            draw.rectangle([x1 + 15 + mgt_w + 3, port_y + 2, x1 + 15 + mgt_w * 2 + 3, port_y + 2 + mgt_h], fill=(2, 132, 199), outline=(14, 165, 233))
            draw.text((x1 + 19 + mgt_w + 3, port_y + 7), "Mgt2", fill=(255, 255, 255), font=font_port)

            data_x = x1 + 86
            draw.rectangle([data_x, port_y, data_x + mgt_w * 2 + 6, port_y + mgt_h + 4], fill=(20, 22, 25), outline=(80, 85, 90), width=1)
            draw.rectangle([data_x + 3, port_y + 2, data_x + 3 + mgt_w, port_y + 2 + mgt_h], fill=(74, 222, 128), outline=(34, 197, 94))
            draw.text((data_x + 7, port_y + 4), "Data\n 2", fill=(10, 40, 15), font=font_port)

            draw.rectangle([data_x + 3 + mgt_w + 3, port_y + 2, data_x + 3 + mgt_w * 2 + 3, port_y + 2 + mgt_h], fill=(74, 222, 128), outline=(34, 197, 94))
            draw.text((data_x + 7 + mgt_w + 3, port_y + 4), "Data\n 1", fill=(10, 40, 15), font=font_port)

            return {
                "mgt1": (x1 + 15 + mgt_w // 2, port_y + 2),
                "data1": (data_x + 3 + mgt_w + 3 + mgt_w // 2, port_y + 2),
            }

        b1_pts = draw_node_bay(c_left + 4, c_top + 4, psu_left - 4, c_mid_y - 3, 1)
        b2_pts = draw_node_bay(psu_right + 4, c_top + 4, c_right - 4, c_mid_y - 3, 2)
        draw_node_bay(c_left + 4, c_mid_y + 3, psu_left - 4, c_bottom - 4, 3)
        draw_node_bay(psu_right + 4, c_mid_y + 3, c_right - 4, c_bottom - 4, 4)

        # Callouts
        x_c1 = b1_pts["mgt1"][0]
        draw.line([(x_c1, b1_pts["mgt1"][1]), (x_c1, 80), (130, 80)], fill=(2, 132, 199), width=3)
        draw.text((135, 70), f"{node_prefix} MGMT", fill=(0, 0, 0), font=font_callout_title)
        draw.text((95, 110), mgmt_speed, fill=(0, 0, 0), font=font_callout_speed)

        x_d1 = b2_pts["data1"][0]
        draw.line([(x_d1, b2_pts["data1"][1]), (x_d1, 35), (x_d1 - 100, 35)], fill=(132, 204, 22), width=3)
        draw.text((x_d1 - 270, 25), f"{node_prefix} 25G Fabric", fill=(0, 0, 0), font=font_callout_title)
        draw.text((x_d1 + 10, 10), data_speed, fill=(0, 0, 0), font=font_callout_speed)

    # Convert to base64 PNG
    final_img = Image.new("RGB", (width, height), (255, 255, 255))
    final_img.paste(img, (0, 0), img)

    bio = io.BytesIO()
    final_img.save(bio, format="PNG", optimize=True)
    b64 = base64.b64encode(bio.getvalue()).decode("ascii")
    data_url = f"data:image/png;base64,{b64}"

    return {
        "title": f"Tampak Belakang & Port: {device_name}",
        "data_url": data_url,
        "image_url": data_url,
        "width": width,
        "height": height,
    }
