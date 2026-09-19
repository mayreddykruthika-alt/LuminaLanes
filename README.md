# LuminaLanes
# Visible Light Communication (Li-Fi) is a wireless communication technology that uses LED light to transmit data. It can provide very high-speed communication, but unlike Wi-Fi, it requires a clear Line-of-Sight (LoS) between the Li-Fi Access Point and the user's device. This becomes a major challenge in crowded indoor environments such as university libraries, classrooms, offices, and laboratories, where people are constantly moving.

# When a person walks between a user and a ceiling-mounted Li-Fi Access Point, the person's body can block the light signal. This can cause a sudden reduction in signal strength, packet loss, increased latency, network timeouts, and even a dropped connection. Traditional systems usually respond only after the signal has already degraded.

# Our proposed system uses predictive handover to solve this problem. The system continuously monitors the position, movement direction, and speed of users and moving obstacles. Using this information, it predicts whether an obstacle is likely to block the optical path in the near future. A predictive warning zone is created around potential obstacles to identify upcoming occlusion before it actually happens.

# When a future blockage is detected, the system searches for alternative Li-Fi Access Points. Instead of selecting only the nearest AP, it also considers factors such as current network load, signal quality, distance, and predicted LoS availability. This creates a **load-balanced optical routing system**, preventing too many users from connecting to the same AP.

# Therefore, the system changes the connection before the physical obstruction occurs. The main goal is to reduce unexpected signal interruptions and maintain continuous communication, making Li-Fi more reliable and practical for high-density indoor environments.
