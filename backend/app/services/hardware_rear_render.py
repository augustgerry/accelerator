"""
High-Fidelity 2U Rear Chassis I/O & Port Callout Generator (Image 2 style).
Renders multi-node server chassis rear view with dual PSUs, 10G/25G SFP28 data ports,
1GbE RJ45 management ports, IPMI, and colored angled callout lines.
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
    """Generate authentic rear chassis I/O diagram with callout lines dynamically tailored to the device category."""
    name_lower = (device_name or "").lower()

    # Category detection
    is_firewall = any(k in name_lower for k in ("firewall", "fortigate", "fortinet", "fg-", "palo", "checkpoint", "ngaf"))
    is_switch = any(k in name_lower for k in ("switch", "catalyst", "cisco switch", "c9300", "c9200", "tor", "leaf", "spine", "nexus"))
    is_storage = any(k in name_lower for k in ("storage", "pure", "flasharray", "san", "nas", "powerstore", "netapp"))

    # 1040 x 360 tight canvas
    width, height = 1040, 360
    img = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Fonts
    font_callout_title = _get_font(13, bold=True)
    font_callout_speed = _get_font(12, bold=True)
    font_port = _get_font(8, bold=True)
    font_screw = _get_font(9, bold=True)

    # Chassis position
    if is_firewall or is_switch:
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

    if is_firewall:
        # ──────── 1U NEXT-GEN FIREWALL REAR (FortiGate 100F Style) ────────
        # Dual Redundant AC Power Supplies on the left
        psu1 = [c_left + 15, c_top + 8, c_left + 145, c_bottom - 8]
        psu2 = [c_left + 155, c_top + 8, c_left + 285, c_bottom - 8]
        for psu_box, psu_lbl in [(psu1, "PSU-1 (AC)"), (psu2, "PSU-2 (AC)")]:
            draw.rectangle(psu_box, fill=(30, 33, 38), outline=(120, 125, 130), width=1)
            # AC plug socket
            cx, cy = (psu_box[0] + psu_box[2]) // 2, (psu_box[1] + psu_box[3]) // 2
            draw.polygon([(cx - 12, cy - 14), (cx + 12, cy - 14), (cx + 15, cy), (cx + 10, cy + 12), (cx - 10, cy + 12), (cx - 15, cy)], fill=(12, 14, 16), outline=(70, 75, 80))
            # Status LED & latch
            draw.ellipse([psu_box[0] + 8, psu_box[3] - 16, psu_box[0] + 16, psu_box[3] - 8], fill=(34, 197, 94))
            draw.rectangle([psu_box[2] - 12, psu_box[3] - 20, psu_box[2] - 4, psu_box[3] - 4], fill=(220, 38, 38))
            draw.text((psu_box[0] + 8, psu_box[1] + 6), psu_lbl, fill=(200, 205, 210), font=_get_font(7, bold=True))

        # Exhaust Cooling Fans in center
        fan_left = c_left + 305
        fan_right = c_left + 465
        draw.rectangle([fan_left, c_top + 8, fan_right, c_bottom - 8], fill=(45, 50, 56), outline=(130, 135, 140))
        for fx in range(fan_left + 10, fan_right - 10, 26):
            draw.ellipse([fx, c_top + 16, fx + 22, c_bottom - 16], fill=(20, 24, 28), outline=(80, 85, 90))
            draw.ellipse([fx + 8, c_top + 24, fx + 14, c_bottom - 24], fill=(120, 125, 130))

        # Ground terminal & Console
        g_x = fan_right + 20
        draw.ellipse([g_x, (c_top + c_bottom) // 2 - 6, g_x + 12, (c_top + c_bottom) // 2 + 6], fill=(217, 119, 6), outline=(146, 64, 14))

        # Management & High Availability Ports
        ha1_x = g_x + 35
        draw.rectangle([ha1_x, c_top + 20, ha1_x + 38, c_bottom - 20], fill=(20, 22, 25), outline=(90, 95, 100))
        draw.rectangle([ha1_x + 3, c_top + 24, ha1_x + 35, c_bottom - 24], fill=(2, 132, 199), outline=(56, 189, 248))
        draw.text((ha1_x + 6, c_top + 34), "HA-1", fill=(255, 255, 255), font=font_port)

        ha2_x = ha1_x + 46
        draw.rectangle([ha2_x, c_top + 20, ha2_x + 38, c_bottom - 20], fill=(20, 22, 25), outline=(90, 95, 100))
        draw.rectangle([ha2_x + 3, c_top + 24, ha2_x + 35, c_bottom - 24], fill=(2, 132, 199), outline=(56, 189, 248))
        draw.text((ha2_x + 6, c_top + 34), "HA-2", fill=(255, 255, 255), font=font_port)

        mgmt_x = ha2_x + 46
        draw.rectangle([mgmt_x, c_top + 20, mgmt_x + 38, c_bottom - 20], fill=(20, 22, 25), outline=(90, 95, 100))
        draw.rectangle([mgmt_x + 3, c_top + 24, mgmt_x + 35, c_bottom - 24], fill=(2, 132, 199), outline=(56, 189, 248))
        draw.text((mgmt_x + 5, c_top + 34), "MGMT", fill=(255, 255, 255), font=font_port)

        # 10G SFP+ FortiLink / WAN Uplink Cages on the right
        sfp1_x = mgmt_x + 65
        for s in range(4):
            sx = sfp1_x + s * 42
            draw.rectangle([sx, c_top + 18, sx + 36, c_bottom - 18], fill=(30, 35, 42), outline=(130, 140, 150))
            draw.rectangle([sx + 3, c_top + 22, sx + 33, c_bottom - 22], fill=(74, 222, 128), outline=(34, 197, 94))
            draw.text((sx + 5, c_top + 34), f"X{s+1}", fill=(10, 40, 15), font=font_port)

        # ── Callout Lines for Firewall (FortiGate 100F) ──
        # Callout 1: Dual Redundant AC PSUs
        draw.line([(c_left + 150, c_top + 8), (c_left + 150, 75), (c_left + 50, 75)], fill=(220, 38, 38), width=3)
        draw.text((c_left + 55, 55), "Dual Redundant AC Power (1+1)", fill=(0, 0, 0), font=font_callout_title)
        draw.text((c_left + 55, 85), "100-240V Hot-Swap", fill=(100, 100, 100), font=font_callout_speed)

        # Callout 2: HA Cluster Sync
        draw.line([(ha1_x + 19, c_top + 20), (ha1_x + 19, 110), (ha1_x - 60, 110)], fill=(2, 132, 199), width=3)
        draw.text((ha1_x - 175, 95), "HA-1 / HA-2 Heartbeat", fill=(0, 0, 0), font=font_callout_title)
        draw.text((ha1_x - 120, 120), "Active-Passive Sync", fill=(100, 100, 100), font=font_callout_speed)

        # Callout 3: Out-of-Band MGMT
        draw.line([(mgmt_x + 19, c_top + 20), (mgmt_x + 19, 50), (mgmt_x + 70, 50)], fill=(2, 132, 199), width=3)
        draw.text((mgmt_x + 75, 40), "Dedicated MGMT Port", fill=(0, 0, 0), font=font_callout_title)
        draw.text((mgmt_x + 75, 65), "1GE RJ45 Dedicated", fill=(100, 100, 100), font=font_callout_speed)

        # Callout 4: 10G SFP+ Uplinks
        draw.line([(sfp1_x + 60, c_top + 18), (sfp1_x + 60, 100), (sfp1_x + 130, 100)], fill=(132, 204, 22), width=3)
        draw.text((sfp1_x + 135, 90), "4x 10GE SFP+ FortiLink / WAN", fill=(0, 0, 0), font=font_callout_title)
        draw.text((sfp1_x + 135, 115), "10G Data Throughput", fill=(100, 100, 100), font=font_callout_speed)

    elif is_switch:
        # ──────── 1U ENTERPRISE SWITCH REAR (Cisco Catalyst Style) ────────
        # Dual Hot-Swap Power Supplies on the left
        psu1 = [c_left + 15, c_top + 8, c_left + 150, c_bottom - 8]
        psu2 = [c_left + 160, c_top + 8, c_left + 295, c_bottom - 8]
        for psu_box, psu_lbl in [(psu1, "PWR-1 (Platinum)"), (psu2, "PWR-2 (Platinum)")]:
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

        # StackWise / Uplink Ports on right
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

        # ── Callouts for Switch ──
        draw.line([(c_left + 155, c_top + 8), (c_left + 155, 75), (c_left + 60, 75)], fill=(220, 38, 38), width=3)
        draw.text((c_left + 65, 55), "Dual Redundant AC Power Supplies", fill=(0, 0, 0), font=font_callout_title)
        draw.text((c_left + 65, 85), "Hot-Swappable 715W", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(stk_x + 46, c_top + 15), (stk_x + 46, 70), (stk_x - 60, 70)], fill=(2, 132, 199), width=3)
        draw.text((stk_x - 220, 55), "StackWise-480 Stacking Ports", fill=(0, 0, 0), font=font_callout_title)
        draw.text((stk_x - 170, 85), "480 Gbps Hardware Stacking", fill=(100, 100, 100), font=font_callout_speed)

        draw.line([(mgmt_x + 21, c_top + 18), (mgmt_x + 21, 50), (mgmt_x + 75, 50)], fill=(132, 204, 22), width=3)
        draw.text((mgmt_x + 80, 40), "Dedicated Out-of-Band MGMT", fill=(0, 0, 0), font=font_callout_title)
        draw.text((mgmt_x + 80, 65), "1G RJ45 Console/MGMT", fill=(100, 100, 100), font=font_callout_speed)

    else:
        # ──────── 2U MULTI-NODE / SERVER / STORAGE REAR (Rubrik, HPE DL360, Nutanix) ────────
        c_mid_y = (c_top + c_bottom) // 2
        psu_left, psu_right = 475, 565
        psu_top_box = [psu_left, c_top + 4, psu_right, c_mid_y - 3]
        psu_bot_box = [psu_left, c_mid_y + 3, psu_right, c_bottom - 4]

        for pb in [psu_top_box, psu_bot_box]:
            draw.rectangle(pb, fill=(35, 38, 42), outline=(140, 145, 150), width=1)
            sx, sy = (pb[0] + pb[2]) // 2, (pb[1] + pb[3]) // 2
            draw.polygon([(sx - 14, sy - 18), (sx + 14, sy - 18), (sx + 18, sy), (sx + 12, sy + 16), (sx - 12, sy + 16), (sx - 18, sy)], fill=(15, 16, 18), outline=(60, 64, 70), width=2)
            for px, py in [(sx - 6, sy - 8), (sx + 6, sy - 8), (sx, sy + 6)]:
                draw.rectangle([px - 2, py - 4, px + 2, py + 4], fill=(180, 185, 190))
            draw.rectangle([pb[2] - 14, pb[3] - 22, pb[2] - 4, pb[3] - 4], fill=(220, 38, 38), outline=(150, 20, 20))
            draw.ellipse([pb[0] + 6, pb[3] - 16, pb[0] + 14, pb[3] - 8], fill=(34, 197, 94))

        def draw_node_bay(x1, y1, x2, y2, bay_id):
            draw.rectangle([x1, y1, x2, y2], fill=(236, 238, 241), outline=(160, 165, 170), width=1)
            grille_top, grille_bot = y1 + 5, y1 + 32
            draw.rectangle([x1 + 6, grille_top, x2 - 6, grille_bot], fill=(215, 218, 222), outline=(170, 175, 180), width=1)
            for gx in range(x1 + 10, x2 - 10, 8):
                for gy in range(grille_top + 4, grille_bot - 4, 6):
                    draw.rectangle([gx, gy, gx + 4, gy + 3], fill=(70, 75, 80))

            draw.ellipse([(x1 + x2) // 2 - 6, y1 + 4, (x1 + x2) // 2 + 6, y1 + 16], fill=(240, 242, 245), outline=(130, 135, 140))
            draw.text(((x1 + x2) // 2 - 3, y1 + 4), "+", fill=(100, 105, 110), font=font_screw)

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

            vga_x = data_x + 74
            draw.polygon([(vga_x, port_y + 2), (vga_x + 34, port_y + 2), (vga_x + 30, port_y + 22), (vga_x + 4, port_y + 22)], fill=(37, 99, 235), outline=(15, 23, 42), width=1)
            for vx in range(vga_x + 7, vga_x + 28, 4):
                for vy in range(port_y + 6, port_y + 19, 4):
                    draw.ellipse([vx, vy, vx + 2, vy + 2], fill=(255, 255, 255))

            usb_x = vga_x + 42
            draw.rectangle([usb_x, port_y + 2, usb_x + 18, port_y + 10], fill=(30, 41, 59), outline=(100, 116, 139))
            draw.rectangle([usb_x + 2, port_y + 4, usb_x + 10, port_y + 8], fill=(2, 132, 199))
            draw.rectangle([usb_x, port_y + 14, usb_x + 18, port_y + 22], fill=(30, 41, 59), outline=(100, 116, 139))
            draw.rectangle([usb_x + 2, port_y + 16, usb_x + 10, port_y + 20], fill=(2, 132, 199))

            ipmi_x = usb_x + 26
            draw.rectangle([ipmi_x, port_y - 2, ipmi_x + 28, port_y + 24], fill=(134, 239, 172), outline=(34, 197, 94), width=1)
            draw.text((ipmi_x + 4, port_y - 2), "MGMT", fill=(20, 83, 45), font=_get_font(7, bold=True))
            draw.rectangle([ipmi_x + 3, port_y + 7, ipmi_x + 25, port_y + 22], fill=(2, 132, 199), outline=(15, 23, 42))
            draw.text((ipmi_x + 5, port_y + 10), "IPMI", fill=(255, 255, 255), font=font_port)

            return {
                "mgt1": (x1 + 15 + mgt_w // 2, port_y + 2),
                "mgt2": (x1 + 15 + mgt_w + 3 + mgt_w // 2, port_y + 2),
                "data2": (data_x + 3 + mgt_w // 2, port_y + 2),
                "data1": (data_x + 3 + mgt_w + 3 + mgt_w // 2, port_y + 2),
                "ipmi": (ipmi_x + 14, port_y + 2),
            }

        # Draw 4 Bays
        b1_pts = draw_node_bay(c_left + 4, c_top + 4, psu_left - 4, c_mid_y - 3, 1)
        b2_pts = draw_node_bay(psu_right + 4, c_top + 4, c_right - 4, c_mid_y - 3, 2)
        draw_node_bay(c_left + 4, c_mid_y + 3, psu_left - 4, c_bottom - 4, 3)
        draw_node_bay(psu_right + 4, c_mid_y + 3, c_right - 4, c_bottom - 4, 4)

        # Callouts for Multi-node Platform
        x_c1 = b1_pts["mgt1"][0]
        draw.line([(x_c1, b1_pts["mgt1"][1]), (x_c1, 80), (130, 80)], fill=(2, 132, 199), width=3)
        draw.text((135, 70), f"{node_prefix} MGMT1", fill=(0, 0, 0), font=font_callout_title)
        draw.text((95, 110), mgmt_speed, fill=(0, 0, 0), font=font_callout_speed)

        x_c2 = b1_pts["mgt2"][0]
        draw.line([(x_c2, b1_pts["mgt2"][1]), (x_c2, 115), (170, 115)], fill=(2, 132, 199), width=3)
        draw.text((175, 105), f"{node_prefix} MGMT2", fill=(0, 0, 0), font=font_callout_title)
        draw.text((140, 135), mgmt_speed, fill=(0, 0, 0), font=font_callout_speed)

        x_d1 = b2_pts["data1"][0]
        draw.line([(x_d1, b2_pts["data1"][1]), (x_d1, 35), (x_d1 - 100, 35)], fill=(132, 204, 22), width=3)
        draw.text((x_d1 - 270, 25), f"{node_prefix} Data1", fill=(0, 0, 0), font=font_callout_title)
        draw.text((x_d1 + 10, 10), data_speed, fill=(0, 0, 0), font=font_callout_speed)

        x_d2 = b2_pts["data2"][0]
        draw.line([(x_d2, b2_pts["data2"][1]), (x_d2, 65), (x_d2 - 100, 65)], fill=(132, 204, 22), width=3)
        draw.text((x_d2 - 270, 55), f"{node_prefix} Data2", fill=(0, 0, 0), font=font_callout_title)
        draw.text((x_d2 + 10, 50), data_speed, fill=(0, 0, 0), font=font_callout_speed)

        x_ip = b2_pts["ipmi"][0]
        draw.line([(x_ip, b2_pts["ipmi"][1]), (x_ip, 100), (x_ip - 40, 100)], fill=(2, 132, 199), width=3)
        draw.text((x_ip - 95, 90), "IPMI", fill=(0, 0, 0), font=font_callout_title)
        draw.text((x_ip + 10, 90), mgmt_speed, fill=(0, 0, 0), font=font_callout_speed)

    # Convert to base64
    final_img = Image.new("RGB", (width, height), (255, 255, 255))
    final_img.paste(img, (0, 0), img)

    bio = io.BytesIO()
    final_img.save(bio, format="PNG", optimize=True)
    b64 = base64.b64encode(bio.getvalue()).decode("ascii")
    data_url = f"data:image/png;base64,{b64}"

    return {
        "title": f"Tampak Belakang & Alokasi Port: {device_name}",
        "data_url": data_url,
        "image_url": data_url,
        "width": width,
        "height": height,
    }
