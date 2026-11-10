import 'package:flutter/material.dart';

/// StudyGyaan design system (2026-11-10 redesign).
/// Website wale brand blue par bana professional Material 3 theme.
/// Light: saaf safed cards + halki slate background + deep blue brand.
/// Dark: gehra navy (murk nahi), saaf borders, wahi brand blue.
class AppTheme {
  static const Color seed = Color(0xFF2563EB);
  static const Color brandDeep = Color(0xFF1E3A8A);
  static const Color brand = Color(0xFF2563EB);
  static const Color brandLight = Color(0xFF3B82F6);
  static const Color accent = Color(0xFFF59E0B);
  static const Color success = Color(0xFF059669);

  // Light surfaces
  static const Color _lightBg = Color(0xFFF6F8FC);
  static const Color _lightBorder = Color(0xFFE3EAF3);
  static const Color _ink = Color(0xFF0F172A);
  static const Color _inkSoft = Color(0xFF526178);

  // Dark surfaces
  static const Color _darkBg = Color(0xFF0B1220);
  static const Color _darkCard = Color(0xFF131E33);
  static const Color _darkBorder = Color(0xFF24334F);
  static const Color _paper = Color(0xFFE8EEF7);
  static const Color _paperSoft = Color(0xFF9FB0C9);

  static TextTheme _text(Color ink, Color soft) {
    return TextTheme(
      headlineSmall: TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w800,
        color: ink,
        letterSpacing: -0.3,
        height: 1.2,
      ),
      titleLarge: TextStyle(
        fontSize: 19,
        fontWeight: FontWeight.w800,
        color: ink,
        letterSpacing: -0.2,
      ),
      titleMedium: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: ink,
      ),
      titleSmall: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: ink,
      ),
      bodyLarge: TextStyle(fontSize: 15.5, color: ink, height: 1.45),
      bodyMedium: TextStyle(fontSize: 14, color: ink, height: 1.45),
      bodySmall: TextStyle(fontSize: 12.5, color: soft, height: 1.4),
      labelLarge: TextStyle(
        fontSize: 13.5,
        fontWeight: FontWeight.w600,
        color: ink,
      ),
      labelMedium: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: soft,
      ),
      labelSmall: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: soft,
      ),
    );
  }

  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(seedColor: seed).copyWith(
      surface: Colors.white,
      onSurface: _ink,
      onSurfaceVariant: _inkSoft,
      outline: const Color(0xFF94A3B8),
      outlineVariant: _lightBorder,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: _lightBg,
      textTheme: _text(_ink, _inkSoft),
      appBarTheme: const AppBarTheme(
        backgroundColor: _lightBg,
        foregroundColor: _ink,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        titleTextStyle: TextStyle(
          fontSize: 19,
          fontWeight: FontWeight.w800,
          color: _ink,
          letterSpacing: -0.2,
        ),
      ),
      cardTheme: CardTheme(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: _lightBorder),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: Colors.white,
        side: const BorderSide(color: _lightBorder),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        labelStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: _ink,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        indicatorColor: const Color(0xFFDBEAFE),
        height: 64,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11.5,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? brandDeep : _inkSoft,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(color: selected ? brandDeep : _inkSoft);
        }),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          textStyle: const TextStyle(
            fontSize: 14.5,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          side: const BorderSide(color: _lightBorder),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _lightBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _lightBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: brand, width: 1.6),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: _lightBorder,
        thickness: 1,
        space: 1,
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: _inkSoft,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      ),
    );
  }

  static ThemeData get dark {
    final scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.dark,
    ).copyWith(
      surface: _darkCard,
      onSurface: _paper,
      onSurfaceVariant: _paperSoft,
      outline: const Color(0xFF5B6B8C),
      outlineVariant: _darkBorder,
      primary: brandLight,
      onPrimary: Colors.white,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: _darkBg,
      textTheme: _text(_paper, _paperSoft),
      appBarTheme: const AppBarTheme(
        backgroundColor: _darkBg,
        foregroundColor: _paper,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        titleTextStyle: TextStyle(
          fontSize: 19,
          fontWeight: FontWeight.w800,
          color: _paper,
          letterSpacing: -0.2,
        ),
      ),
      cardTheme: CardTheme(
        color: _darkCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: _darkBorder),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: _darkCard,
        side: const BorderSide(color: _darkBorder),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        labelStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: _paper,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: const Color(0xFF0E1830),
        indicatorColor: const Color(0xFF1E3A8A),
        height: 64,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11.5,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? Colors.white : _paperSoft,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(color: selected ? Colors.white : _paperSoft);
        }),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          textStyle: const TextStyle(
            fontSize: 14.5,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          side: const BorderSide(color: _darkBorder),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: _darkCard,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _darkBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _darkBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: brandLight, width: 1.6),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: _darkBorder,
        thickness: 1,
        space: 1,
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: _paperSoft,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      ),
    );
  }
}

/// Brand gradient — welcome hero + cover art dono ke liye ek hi pehchan.
const LinearGradient brandGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [AppTheme.brandDeep, AppTheme.brand, AppTheme.brandLight],
);
