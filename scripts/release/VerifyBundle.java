import com.android.aapt.Resources;
import java.nio.file.*;
import java.util.jar.*;
import java.security.MessageDigest;
import java.util.HexFormat;

/** Verify the built artifact, not only source settings. No signing passwords are needed. */
class VerifyBundle {
    static String attribute(Resources.XmlElement element, String name) {
        for (var attr : element.getAttributeList()) {
            if (!attr.getName().equals(name)) continue;
            if (!attr.getValue().isEmpty()) return attr.getValue();
            var item = attr.getCompiledItem();
            if (item.hasStr()) return item.getStr().getValue();
            if (item.hasPrim()) {
                var primitive = item.getPrim();
                return switch (primitive.getOneofValueCase().name()) {
                    case "INT_DECIMAL_VALUE" -> String.valueOf(primitive.getIntDecimalValue());
                    case "INT_HEXADECIMAL_VALUE" -> String.valueOf(primitive.getIntHexadecimalValue());
                    case "BOOLEAN_VALUE" -> String.valueOf(primitive.getBooleanValue());
                    default -> null;
                };
            }
        }
        return null;
    }
    static void require(boolean condition, String message) throws Exception {
        if (!condition) throw new Exception(message);
    }
    public static void main(String[] args) throws Exception {
        require(args.length == 5, "Usage: VerifyBundle <aab> <web-out> <previous-aab> <versionCode> <versionName>");
        try (JarFile bundle = new JarFile(args[0], true)) {
            var root = Resources.XmlNode.parseFrom(bundle.getInputStream(bundle.getJarEntry("base/manifest/AndroidManifest.xml"))).getElement();
            require("com.qgambit.app".equals(attribute(root, "package")), "Unexpected application package");
            String code = attribute(root, "versionCode"), name = attribute(root, "versionName");
            require(args[3].equals(code) && args[4].equals(name), "Unexpected bundle version: " + code + " / " + name);
            boolean checkedActivity = false, checkedCategory = false, billingPermission = false;
            for (var child : root.getChildList()) {
                if (child.hasElement() && child.getElement().getName().equals("uses-permission")) {
                    String permission = attribute(child.getElement(), "name");
                    if ("com.android.vending.BILLING".equals(permission)) billingPermission = true;
                    require(!"com.google.android.gms.permission.AD_ID".equals(permission)
                        && (permission == null || !permission.startsWith("android.permission.ACCESS_ADSERVICES_")),
                        "Unexpected advertising permission: " + permission);
                }
                if (!child.hasElement() || !child.getElement().getName().equals("application")) continue;
                require(!"true".equals(attribute(child.getElement(), "debuggable")), "Release must not be debuggable");
                String category = attribute(child.getElement(), "appCategory");
                checkedCategory = "game".equals(category) || "0".equals(category);
                for (var node : child.getElement().getChildList()) {
                    if (!node.hasElement() || !node.getElement().getName().equals("activity")) continue;
                    var activity = node.getElement();
                    String activityName = attribute(activity, "name");
                    if (!"com.qgambit.app.MainActivity".equals(activityName) && !".MainActivity".equals(activityName)) continue;
                    String orientation = attribute(activity, "screenOrientation");
                    require("portrait".equals(orientation) || "1".equals(orientation), "MainActivity must remain portrait");
                    require("true".equals(attribute(activity, "resizeableActivity")), "MainActivity must support resizing");
                    checkedActivity = true;
                }
            }
            require(checkedActivity && checkedCategory, "Expected main activity/game category missing");
            if (Integer.parseInt(code) >= 17) {
                require(billingPermission, "Pre-registration requires the Billing permission");
                boolean nativeReward = false;
                for (var entry : java.util.Collections.list(bundle.entries())) {
                    if (!entry.getName().startsWith("base/dex/") || !entry.getName().endsWith(".dex")) continue;
                    String dex = new String(bundle.getInputStream(entry).readAllBytes(), java.nio.charset.StandardCharsets.ISO_8859_1);
                    if (dex.contains("qg_founders_preregister") && dex.contains("PlayRewards")) nativeReward = true;
                }
                require(nativeReward, "Native pre-registration reward bridge missing from DEX");
                System.out.println("Verified native Play reward bridge and Billing permission");
            }
            int assets = 0;
            Path web = Path.of(args[1]);
            try (var paths = Files.walk(web)) {
                for (Path path : paths.filter(Files::isRegularFile).toList()) {
                    String relative = web.relativize(path).toString().replace('\\', '/');
                    var entry = bundle.getJarEntry("base/assets/public/" + relative);
                    require(entry != null, "Missing asset: " + relative);
                    require(java.util.Arrays.equals(bundle.getInputStream(entry).readAllBytes(), Files.readAllBytes(path)), "Asset differs: " + relative);
                    assets++;
                }
            }
            var index = bundle.getJarEntry("base/assets/public/index.html");
            bundle.getInputStream(index).readAllBytes();
            require(index.getCertificates() != null && index.getCertificates().length > 0, "Unsigned Web entry");
            var certificate = index.getCertificates()[0];
            try (JarFile previous = new JarFile(args[2], true)) {
                var previousRoot = Resources.XmlNode.parseFrom(previous.getInputStream(previous.getJarEntry("base/manifest/AndroidManifest.xml"))).getElement();
                require(Integer.parseInt(code) > Integer.parseInt(attribute(previousRoot, "versionCode")), "versionCode must increase");
                var oldIndex = previous.getJarEntry("base/assets/public/index.html");
                previous.getInputStream(oldIndex).readAllBytes();
                require(oldIndex.getCertificates() != null && certificate.equals(oldIndex.getCertificates()[0]), "Signing certificate differs from previous release");
            }
            System.out.println("Verified versionCode=" + code + ", versionName=" + name);
            System.out.println("Verified MainActivity portrait=true, resizeable=true, appCategory=game");
            System.out.println("Verified release-only package and absence of advertising identifier permissions");
            System.out.println("Matched latest Web assets: " + assets);
            System.out.println("Signing certificate matches previous release: " + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded())));
        }
    }
}
